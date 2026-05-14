const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const supabase = require('../supabase');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('claims')
    .setDescription('View or manage active claims')
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('See all active claims')
        .addStringOption(opt =>
          opt.setName('project').setDescription('Filter by project name (optional)').setRequired(false)))
    .addSubcommand(sub =>
      sub.setName('mine')
        .setDescription('See your own active claims'))
    .addSubcommand(sub =>
      sub.setName('drop')
        .setDescription('Drop one of your claims')
        .addStringOption(opt =>
          opt.setName('item').setDescription('Item name to unclaim').setRequired(true))
        .addStringOption(opt =>
          opt.setName('project').setDescription('Project name').setRequired(true))),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'list') {
      const projectFilter = interaction.options.getString('project');

      let query = supabase
        .from('claims')
        .select('*, projects(name)')
        .eq('status', 'active')
        .order('claimed_at', { ascending: false });

      if (projectFilter) {
        const { data: project } = await supabase
          .from('projects')
          .select('id')
          .ilike('name', projectFilter)
          .single();

        if (!project) return interaction.reply({ content: `❌ Project "${projectFilter}" not found.`, ephemeral: true });
        query = query.eq('project_id', project.id);
      }

      const { data: claims } = await query;

      if (!claims?.length) {
        return interaction.reply({ content: '📭 No active claims found.', ephemeral: true });
      }

      // Group by project
      const grouped = {};
      for (const claim of claims) {
        const pName = claim.projects?.name || 'Unknown';
        if (!grouped[pName]) grouped[pName] = [];
        grouped[pName].push(claim);
      }

      const embed = new EmbedBuilder()
        .setTitle('⚒️ Active Claims')
        .setColor(0xEB459E)
        .setTimestamp();

      for (const [pName, pClaims] of Object.entries(grouped)) {
        const lines = pClaims.map(c => `• **${c.quantity}x ${c.item_name}** — ${c.discord_user}`);
        embed.addFields({ name: `📦 ${pName}`, value: lines.join('\n'), inline: false });
      }

      return interaction.reply({ embeds: [embed] });
    }

    if (sub === 'mine') {
      const { data: claims } = await supabase
        .from('claims')
        .select('*, projects(name)')
        .eq('discord_uid', interaction.user.id)
        .eq('status', 'active')
        .order('claimed_at', { ascending: false });

      if (!claims?.length) {
        return interaction.reply({ content: '📭 You have no active claims.', ephemeral: true });
      }

      const lines = claims.map(c =>
        `• **${c.quantity}x ${c.item_name}** for **${c.projects?.name || 'Unknown'}**`
      );

      const embed = new EmbedBuilder()
        .setTitle(`⚒️ Your Active Claims`)
        .setDescription(lines.join('\n'))
        .setColor(0xEB459E)
        .setTimestamp();

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === 'drop') {
      const itemName = interaction.options.getString('item');
      const projectName = interaction.options.getString('project');

      const { data: project } = await supabase
        .from('projects')
        .select('id')
        .ilike('name', projectName)
        .single();

      if (!project) return interaction.reply({ content: `❌ Project "${projectName}" not found.`, ephemeral: true });

      const { data: claim } = await supabase
        .from('claims')
        .select('id')
        .eq('project_id', project.id)
        .ilike('item_name', itemName)
        .eq('discord_uid', interaction.user.id)
        .eq('status', 'active')
        .single();

      if (!claim) {
        return interaction.reply({ content: `❌ No active claim found for "${itemName}" in "${projectName}".`, ephemeral: true });
      }

      await supabase.from('claims').update({ status: 'fulfilled', fulfilled_at: new Date().toISOString() }).eq('id', claim.id);

      return interaction.reply(`✅ Dropped your claim on **${itemName}** for **${projectName}**.`);
    }
  }
};
