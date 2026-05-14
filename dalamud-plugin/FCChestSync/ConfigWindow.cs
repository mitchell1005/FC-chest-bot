using Dalamud.Interface.Windowing;
using Dalamud.Bindings.ImGui;
using System.Numerics;

namespace FCChestSync;

public class ConfigWindow : Window
{
    private readonly Plugin plugin;
    private string urlBuffer = "";
    private string keyBuffer = "";

    public ConfigWindow(Plugin plugin) : base(
        "FC Chest Sync Configuration",
        ImGuiWindowFlags.NoResize)
    {
        this.plugin = plugin;
        Size = new Vector2(480, 320);
        SizeCondition = ImGuiCond.Always;
    }

    public override void OnOpen()
    {
        urlBuffer = plugin.Config.BotSyncUrl;
        keyBuffer = plugin.Config.ApiKey;
    }

    public override void Draw()
    {
        ImGui.TextWrapped("Configure the connection to your Discord bot's sync endpoint.");
        ImGui.Spacing();
        ImGui.Separator();
        ImGui.Spacing();

        ImGui.Text("Bot Sync URL:");
        ImGui.SetNextItemWidth(-1);
        if (ImGui.InputText("##url", ref urlBuffer, 512))
            plugin.Config.BotSyncUrl = urlBuffer;

        ImGui.TextDisabled("e.g. http://localhost:3000/sync");
        ImGui.Spacing();

        ImGui.Text("API Key:");
        ImGui.SetNextItemWidth(-1);
        if (ImGui.InputText("##apikey", ref keyBuffer, 128, ImGuiInputTextFlags.Password))
            plugin.Config.ApiKey = keyBuffer;

        ImGui.TextDisabled("Must match SYNC_API_KEY in your bot's .env file.");
        ImGui.Spacing();

        var showToast = plugin.Config.ShowSyncToast;
        if (ImGui.Checkbox("Show toast notification on sync", ref showToast))
            plugin.Config.ShowSyncToast = showToast;

        ImGui.Spacing();
        ImGui.Text("Sync cooldown (seconds):");
        ImGui.SameLine();
        ImGui.SetNextItemWidth(60);
        var cooldown = plugin.Config.SyncCooldownSeconds;
        if (ImGui.InputInt("##cooldown", ref cooldown))
        {
            if (cooldown < 5) cooldown = 5;
            if (cooldown > 300) cooldown = 300;
            plugin.Config.SyncCooldownSeconds = cooldown;
        }

        ImGui.Spacing();
        ImGui.Separator();
        ImGui.Spacing();

        if (ImGui.Button("Save"))
        {
            plugin.SaveConfig();
            IsOpen = false;
        }
        ImGui.SameLine();
        if (ImGui.Button("Cancel"))
            IsOpen = false;
    }
}