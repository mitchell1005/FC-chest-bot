using Dalamud.Game.Inventory;
using Dalamud.Game.Inventory.InventoryEventArgTypes;
using Dalamud.Interface.Windowing;
using Dalamud.IoC;
using Dalamud.Plugin;
using Dalamud.Plugin.Services;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Lumina.Excel.Sheets;

namespace FCChestSync;

public sealed class Plugin : IDalamudPlugin
{
    [PluginService] internal static IDalamudPluginInterface PluginInterface { get; private set; } = null!;
    [PluginService] internal static IGameInventory GameInventory { get; private set; } = null!;
    [PluginService] internal static IObjectTable ObjectTable { get; private set; } = null!;
    [PluginService] internal static IPluginLog Log { get; private set; } = null!;
    [PluginService] internal static IToastGui ToastGui { get; private set; } = null!;
    [PluginService] internal static IFramework Framework { get; private set; } = null!;
    [PluginService] internal static IDataManager DataManager { get; private set; } = null!;

    internal PluginConfig Config { get; private set; }

    private readonly WindowSystem windowSystem = new("FCChestSync");
    private readonly ConfigWindow configWindow;
    private readonly HttpClient httpClient = new();
    private DateTime lastSyncTime = DateTime.MinValue;
    private CancellationTokenSource? syncDebounce;

    private static readonly GameInventoryType[] FcChestTypes =
    [
        GameInventoryType.FreeCompanyPage1,
        GameInventoryType.FreeCompanyPage2,
        GameInventoryType.FreeCompanyPage3,
        GameInventoryType.FreeCompanyPage4,
        GameInventoryType.FreeCompanyPage5,
    ];

    public Plugin()
    {
        Config = PluginInterface.GetPluginConfig() as PluginConfig ?? new PluginConfig();

        configWindow = new ConfigWindow(this);
        windowSystem.AddWindow(configWindow);

        PluginInterface.UiBuilder.Draw += DrawUI;
        PluginInterface.UiBuilder.OpenConfigUi += OpenConfigUI;

        GameInventory.InventoryChangedRaw += OnInventoryChanged;

        Log.Info("FC Chest Sync loaded.");
    }

    private void DrawUI() => windowSystem.Draw();
    private void OpenConfigUI() => configWindow.Toggle();

    private void OnInventoryChanged(IReadOnlyCollection<InventoryEventArgs> events)
    {
        bool isFcChestEvent = events.Any(e => FcChestTypes.Contains(e.Item.ContainerType));
        if (!isFcChestEvent) return;

        syncDebounce?.Cancel();
        syncDebounce = new CancellationTokenSource();
        var token = syncDebounce.Token;

        Task.Delay(2000, token).ContinueWith(t =>
        {
            if (t.IsCanceled) return;
            // Dispatch back to main thread
            Framework.RunOnFrameworkThread(() => TrySyncChest());
        }, TaskScheduler.Default);
    }

    private void TrySyncChest()
    {
        if ((DateTime.UtcNow - lastSyncTime).TotalSeconds < Config.SyncCooldownSeconds)
        {
            Log.Debug("Sync skipped — cooldown active.");
            return;
        }

        if (string.IsNullOrWhiteSpace(Config.BotSyncUrl))
        {
            Log.Warning("FC Chest Sync: No bot URL configured. Open plugin settings to set it up.");
            return;
        }

        lastSyncTime = DateTime.UtcNow;

        // Capture name and items on the main thread BEFORE going async
        var characterName = ObjectTable.LocalPlayer?.Name.TextValue ?? "Unknown";
        var items = ReadFcChestItems();

        _ = Task.Run(() => SyncChestAsync(characterName, items));
    }

    private async Task SyncChestAsync(string characterName, List<ChestItem> items)
    {
        var payload = new
        {
            characterName,
            items = items.Select(i => new
            {
                itemId = i.ItemId,
                itemName = i.ItemName,
                quantity = i.Quantity,
                tab = i.Tab
            }).ToArray()
        };

        var json = JsonSerializer.Serialize(payload);

        int maxAttempts = 6;
        int delaySeconds = 10;

        for (int attempt = 1; attempt <= maxAttempts; attempt++)
        {
            try
            {
                var content = new StringContent(json, Encoding.UTF8, "application/json");
                using var request = new HttpRequestMessage(HttpMethod.Post, Config.BotSyncUrl);
                request.Headers.Add("x-api-key", Config.ApiKey);
                request.Content = content;

                using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(8));
                var response = await httpClient.SendAsync(request, cts.Token);

                if (response.IsSuccessStatusCode)
                {
                    Log.Info($"FC chest synced — {items.Count} items (attempt {attempt}).");
                    if (Config.ShowSyncToast)
                        ToastGui.ShowNormal($"FC Chest synced — {items.Count} items sent to Discord bot.");
                    return;
                }

                Log.Warning($"Sync attempt {attempt} failed: {response.StatusCode}");
            }
            catch (Exception ex)
            {
                Log.Warning($"Sync attempt {attempt} failed: {ex.Message}");
            }

            if (attempt < maxAttempts)
                await Task.Delay(TimeSpan.FromSeconds(delaySeconds));
        }

        Log.Error("FC Chest Sync failed after all attempts.");
        if (Config.ShowSyncToast)
            ToastGui.ShowError("FC Chest Sync failed — bot may be offline.");
    }

    private List<ChestItem> ReadFcChestItems()
    {
        var result = new List<ChestItem>();

        for (int tabIndex = 0; tabIndex < FcChestTypes.Length; tabIndex++)
        {
            var inventoryType = FcChestTypes[tabIndex];

            // API 14: use GetInventoryItems which returns ReadOnlySpan<GameInventoryItem>
            var slots = GameInventory.GetInventoryItems(inventoryType);

            for (int slot = 0; slot < slots.Length; slot++)
            {
                var item = slots[slot];
                if (item.ItemId == 0) continue;

                var existing = result.FirstOrDefault(r => r.ItemId == item.ItemId && r.Tab == tabIndex);
                if (existing != null)
                {
                    existing.Quantity += Convert.ToUInt32(item.Quantity);
                }
                else
                {

                    var baseId = item.ItemId > 1000000 ? item.ItemId - 1000000 : item.ItemId;
                    var name = DataManager.GetExcelSheet<Lumina.Excel.Sheets.Item>()
                        ?.TryGetRow(baseId, out var row) == true
                        ? row.Name.ToString()
                        : item.ItemId.ToString();
                    var isHq = item.ItemId > 1000000;

                    result.Add(new ChestItem
                    {
                        ItemId = item.ItemId,
                        ItemName = isHq ? $"{name} (HQ)" : name,
                        Quantity = Convert.ToUInt32(item.Quantity),
                        Tab = tabIndex
                    });
                }
            }
        }

        return result;
    }

    public void Dispose()
    {
        GameInventory.InventoryChangedRaw -= OnInventoryChanged;
        syncDebounce?.Cancel();
        PluginInterface.UiBuilder.Draw -= DrawUI;
        PluginInterface.UiBuilder.OpenConfigUi -= OpenConfigUI;
        httpClient.Dispose();
    }

    internal void SaveConfig() => PluginInterface.SavePluginConfig(Config);
}

internal class ChestItem
{
    public uint ItemId { get; set; }
    public string ItemName { get; set; } = "";
    public uint Quantity { get; set; }
    public int Tab { get; set; }
}