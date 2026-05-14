using Dalamud.Configuration;
using Dalamud.Plugin;
using System;

namespace FCChestSync;

[Serializable]
public class PluginConfig : IPluginConfiguration
{
    public int Version { get; set; } = 1;

    // URL of your Discord bot's sync endpoint
    // e.g. https://your-bot.railway.app/sync
    public string BotSyncUrl { get; set; } = "";

    // Must match SYNC_API_KEY in your bot's .env
    public string ApiKey { get; set; } = "";

    // Whether to show a toast notification after each sync
    public bool ShowSyncToast { get; set; } = true;

    // Cooldown in seconds between syncs (prevents spamming on rapid chest open/close)
    public int SyncCooldownSeconds { get; set; } = 10;
}
