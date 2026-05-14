require('dotenv').config();
const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
const http = require('http');
const fs = require('fs');
const path = require('path');
const supabase = require('./supabase');

// ============================================================
// Discord Client
// ============================================================
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Collection();

// Load commands
const commandsPath = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'))) {
  const command = require(path.join(commandsPath, file));
  client.commands.set(command.data.name, command);
}

client.once('ready', () => {
  console.log(`✅ Bot online as ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(`Error in /${interaction.commandName}:`, err);
    const msg = { content: '❌ An error occurred while running this command.', ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(msg).catch(() => { });
    } else {
      await interaction.reply(msg).catch(() => { });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);

// ============================================================
// HTTP server — receives chest sync POSTs from Dalamud plugin
// ============================================================
const PORT = process.env.PORT || 3000;

const server = http.createServer(async (req, res) => {
  // Health check
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ status: 'ok' }));
  }

  // Chest sync endpoint
  if (req.method === 'POST' && req.url === '/sync') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        // Validate API key header
        const authHeader = req.headers['x-api-key'];
        if (authHeader !== process.env.SYNC_API_KEY) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Unauthorized' }));
        }

        const payload = JSON.parse(body);
        // payload: { characterName: string, items: [{ itemId, itemName, quantity, tab }] }

        if (!payload.items || !Array.isArray(payload.items)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Invalid payload' }));
        }

        // Upsert all chest items
        const now = new Date().toISOString();
        const rows = payload.items.map(i => ({
          item_id: i.itemId,
          item_name: i.itemName,
          quantity: i.quantity,
          tab: i.tab ?? 0,
          last_synced: now
        }));

        // Delete old snapshot then insert new one (cleanest approach)
        // Post notification BEFORE wiping old data so we can diff
        await postSyncNotification(payload.characterName, rows);

        // Delete old snapshot then insert new one (cleanest approach)
        await supabase.from('chest_items').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        if (rows.length > 0) {
          await supabase.from('chest_items').insert(rows);
        }

        // Log the sync
        await supabase.from('sync_log').insert({
          synced_by: payload.characterName || 'Unknown',
          item_count: rows.length
        });

        // Auto-fulfill claims for items now in chest at required quantities
        await autoFulfillClaims();

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, itemCount: rows.length }));
      } catch (err) {
        console.error('Sync error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal error' }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, () => {
  console.log(`🌐 Sync server listening on port ${PORT}`);
});

// ============================================================
// Auto-fulfill claims when items arrive in chest
// ============================================================
async function autoFulfillClaims() {
  const { data: claims } = await supabase
    .from('claims')
    .select('*, project_items!inner(quantity_needed)')
    .eq('status', 'active');

  if (!claims?.length) return;

  const { data: chest } = await supabase.from('chest_items').select('item_name, quantity');
  if (!chest?.length) return;

  for (const claim of claims) {
    const inChest = chest.find(c => c.item_name.toLowerCase() === claim.item_name.toLowerCase());
    if (!inChest) continue;

    // Get the project's required quantity for this item
    const { data: pi } = await supabase
      .from('project_items')
      .select('quantity_needed')
      .eq('project_id', claim.project_id)
      .ilike('item_name', claim.item_name)
      .single();

    if (pi && inChest.quantity >= pi.quantity_needed) {
      await supabase.from('claims').update({
        status: 'fulfilled',
        fulfilled_at: new Date().toISOString()
      }).eq('id', claim.id);
    }
  }
}

// ============================================================
// Discord sync notification
// ============================================================
async function postSyncNotification(characterName, newItems) {
  const channelId = process.env.SYNC_LOG_CHANNEL_ID;
  if (!channelId || !client.isReady()) return;

  try {
    // Get previous chest state before we wiped it
    const { data: oldItems } = await supabase
      .from('chest_items')
      .select('item_name, quantity');

    const added = [];
    const removed = [];

    for (const newItem of newItems) {
      const old = (oldItems || []).find(o => o.item_name === newItem.item_name);
      const oldQty = old?.quantity || 0;
      const diff = newItem.quantity - oldQty;
      if (diff > 0) added.push(`+${diff} ${newItem.item_name}`);
      if (diff < 0) removed.push(`${diff} ${newItem.item_name}`);
    }

    // Items that disappeared entirely
    for (const oldItem of (oldItems || [])) {
      const stillExists = newItems.find(n => n.item_name === oldItem.item_name);
      if (!stillExists) removed.push(`-${oldItem.quantity} ${oldItem.item_name}`);
    }

    let message = `🔄 FC Chest synced by **${characterName || 'Unknown'}** — ${newItems.length} items tracked.`;
    if (added.length) message += `\n📥 **Added:** ${added.join(', ')}`;
    if (removed.length) message += `\n📤 **Removed:** ${removed.join(', ')}`;
    if (!added.length && !removed.length) message += `\n*(No changes since last sync)*`;

    const channel = await client.channels.fetch(channelId);
    if (channel?.isTextBased()) await channel.send(message);
  } catch (err) {
    console.error('Failed to post sync notification:', err);
  }
}
