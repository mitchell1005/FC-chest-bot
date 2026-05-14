const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const supabase = require('../supabase');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('chest')
    .setDescription('View the current FC chest snapshot')
    .addStringOption(opt =>
      opt.setName('search').setDescription('Search for a specific item').setRequired(false)),

  async execute(interaction) {
    const search = interaction.options.getString('search');

    let query = supabase
      .from('chest_items')
      .select('*')
      .order('item_name', { ascending: true });

    if (search) {
      query = query.ilike('item_name', `%${search}%`);
    }

    const { data: items, error } = await query;

    if (error) return interaction.reply({ content: '❌ Failed to fetch chest contents.', ephemeral: true });

    // Get last sync time
    const { data: lastSync } = await supabase
      .from('sync_log')
      .select('synced_at, synced_by, item_count')
      .order('synced_at', { ascending: false })
      .limit(1)
      .single();

    if (!items?.length) {
      const msg = search
        ? `📭 No items matching "${search}" found in the chest.`
        : '📭 Chest appears empty or has never been synced. Ask an FC member to open the chest in-game.';
      return interaction.reply({ content: msg, ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setTitle(`🏦 FC Chest Contents${search ? ` — "${search}"` : ''}`)
      .setColor(0xFFD700)
      .setTimestamp();

    if (lastSync) {
      const syncDate = new Date(lastSync.synced_at);
      embed.setFooter({ text: `Last synced by ${lastSync.synced_by || 'unknown'} • ${timeAgo(syncDate)}` });
    } else {
      embed.setFooter({ text: 'Never synced' });
    }

    // Group by tab
    const byTab = {};
    for (const item of items) {
      const tab = item.tab ?? 0;
      if (!byTab[tab]) byTab[tab] = [];
      byTab[tab].push(item);
    }

    for (const [tab, tabItems] of Object.entries(byTab)) {
      const lines = tabItems.map(i => `• ${i.item_name} ×${i.quantity}`);
      // Discord field value limit is 1024 chars — chunk if needed
      const chunks = chunkLines(lines, 1024);
      for (let i = 0; i < chunks.length; i++) {
        embed.addFields({
          name: i === 0 ? `Tab ${parseInt(tab) + 1}` : `Tab ${parseInt(tab) + 1} (cont.)`,
          value: chunks[i],
          inline: false
        });
      }
    }

    return interaction.reply({ embeds: [embed] });
  }
};

function timeAgo(date) {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function chunkLines(lines, maxLength) {
  const chunks = [];
  let current = '';
  for (const line of lines) {
    if ((current + '\n' + line).length > maxLength) {
      chunks.push(current);
      current = line;
    } else {
      current = current ? current + '\n' + line : line;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
