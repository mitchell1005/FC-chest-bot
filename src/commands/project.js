const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const supabase = require('../supabase');
const { getPresetNames, getPreset } = require('../presets');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('project')
    .setDescription('Manage FC crafting projects')
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('List all active projects'))
    .addSubcommand(sub =>
      sub.setName('view')
        .setDescription('View project progress and remaining needs')
        .addStringOption(opt =>
          opt.setName('name').setDescription('Project name').setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('Create a new custom project')
        .addStringOption(opt =>
          opt.setName('name').setDescription('Project name').setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('preset')
        .setDescription('Start a project from a preset list')
        .addStringOption(opt =>
          opt.setName('preset').setDescription('Preset key (use /project presets to see options)').setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('presets')
        .setDescription('List all available preset projects'))
    .addSubcommand(sub =>
      sub.setName('add-item')
        .setDescription('Add an item requirement to a project')
        .addStringOption(opt =>
          opt.setName('project').setDescription('Project name').setRequired(true))
        .addStringOption(opt =>
          opt.setName('item').setDescription('Item name').setRequired(true))
        .addIntegerOption(opt =>
          opt.setName('quantity').setDescription('Quantity needed').setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('complete')
        .setDescription('Mark a project as completed')
        .addStringOption(opt =>
          opt.setName('name').setDescription('Project name').setRequired(true))),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'list') {
      const { data: projects, error } = await supabase
        .from('projects')
        .select('*')
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (error) return interaction.reply({ content: '❌ Failed to fetch projects.', ephemeral: true });
      if (!projects.length) return interaction.reply({ content: '📭 No active projects. Start one with `/project add` or `/project preset`.', ephemeral: true });

      const embed = new EmbedBuilder()
        .setTitle('📋 Active FC Projects')
        .setColor(0x5865F2)
        .setTimestamp();

      for (const p of projects) {
        // Get item count and chest coverage
        const { data: items } = await supabase
          .from('project_items')
          .select('item_name, quantity_needed')
          .eq('project_id', p.id);

        const { data: chest } = await supabase
          .from('chest_items')
          .select('item_name, quantity');

        let fulfilled = 0;
        for (const item of items || []) {
          const found = (chest || []).find(c => c.item_name.toLowerCase() === item.item_name.toLowerCase());
          if (found && found.quantity >= item.quantity_needed) fulfilled++;
        }

        const total = items?.length || 0;
        const bar = progressBar(fulfilled, total);
        embed.addFields({
          name: `${p.type === 'preset' ? '⚙️' : '✏️'} ${p.name}`,
          value: `${bar} ${fulfilled}/${total} items ready\nCreated by ${p.created_by || 'unknown'}`,
          inline: false
        });
      }

      return interaction.reply({ embeds: [embed] });
    }

    if (sub === 'view') {
      const name = interaction.options.getString('name');

      const { data: project } = await supabase
        .from('projects')
        .select('*')
        .ilike('name', name)
        .single();

      if (!project) return interaction.reply({ content: `❌ Project "${name}" not found.`, ephemeral: true });

      const { data: items } = await supabase
        .from('project_items')
        .select('*')
        .eq('project_id', project.id);

      const { data: chest } = await supabase
        .from('chest_items')
        .select('item_name, quantity');

      const { data: claims } = await supabase
        .from('claims')
        .select('*')
        .eq('project_id', project.id)
        .eq('status', 'active');

      const embed = new EmbedBuilder()
        .setTitle(`📦 ${project.name}`)
        .setColor(0x57F287)
        .setTimestamp()
        .setFooter({ text: `Project ID: ${project.id.slice(0, 8)}` });

      let readyLines = [];
      let neededLines = [];

      for (const item of items || []) {
        const inChest = (chest || []).find(c => c.item_name.toLowerCase() === item.item_name.toLowerCase());
        const chestQty = inChest?.quantity || 0;
        const claimed = (claims || [])
          .filter(c => c.item_name.toLowerCase() === item.item_name.toLowerCase())
          .reduce((sum, c) => sum + c.quantity, 0);

        const still_needed = Math.max(0, item.quantity_needed - chestQty);

        if (still_needed === 0) {
          readyLines.push(`✅ ${item.item_name} (${chestQty}/${item.quantity_needed})`);
        } else {
          const claimStr = claimed > 0 ? ` *(${claimed} claimed)*` : '';
          neededLines.push(`❌ ${item.item_name} — need ${still_needed} more (have ${chestQty})${claimStr}`);
        }
      }

      if (readyLines.length) {
        embed.addFields({ name: '✅ In Chest', value: readyLines.join('\n'), inline: false });
      }
      if (readyLines.length) {
        embed.addFields({ name: '✅ In Chest', value: readyLines.join('\n'), inline: false });
      }

      if (neededLines.length) {
        const chunks = chunkLines(neededLines, 1024);
        for (let i = 0; i < chunks.length; i++) {
          embed.addFields({
            name: i === 0 ? '⏳ Still Needed' : '⏳ Still Needed (cont.)',
            value: chunks[i],
            inline: false
          });
        }
      }
      if (!readyLines.length && !neededLines.length) {
        embed.setDescription('No items defined for this project yet. Use `/project add-item` to add some.');
      }

      return interaction.reply({ embeds: [embed] });
    }

    if (sub === 'add') {
      const name = interaction.options.getString('name');

      const { error } = await supabase.from('projects').insert({
        name,
        type: 'custom',
        created_by: interaction.user.username
      });

      if (error) {
        if (error.code === '23505') return interaction.reply({ content: `❌ A project named "${name}" already exists.`, ephemeral: true });
        return interaction.reply({ content: '❌ Failed to create project.', ephemeral: true });
      }

      return interaction.reply(`✅ Project **${name}** created! Add items with \`/project add-item\`.`);
    }

    if (sub === 'preset') {
      const key = interaction.options.getString('preset');
      const preset = getPreset(key);

      if (!preset) {
        const list = getPresetNames().map(p => `\`${p.key}\` — ${p.name}`).join('\n');
        return interaction.reply({ content: `❌ Unknown preset. Available presets:\n${list}`, ephemeral: true });
      }

      const { data: project, error } = await supabase
        .from('projects')
        .insert({ name: preset.name, type: 'preset', created_by: interaction.user.username })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') return interaction.reply({ content: `❌ A project named "${preset.name}" already exists.`, ephemeral: true });
        return interaction.reply({ content: '❌ Failed to create project.', ephemeral: true });
      }

      const itemRows = preset.items.map(i => ({ ...i, project_id: project.id }));
      await supabase.from('project_items').insert(itemRows);

      return interaction.reply(`✅ Project **${preset.name}** started with ${preset.items.length} preset items!`);
    }

    if (sub === 'presets') {
      const list = getPresetNames().map(p => `\`${p.key}\` — ${p.name}`).join('\n');
      const embed = new EmbedBuilder()
        .setTitle('⚙️ Available Presets')
        .setDescription(list)
        .setColor(0xFEE75C);
      return interaction.reply({ embeds: [embed] });
    }

    if (sub === 'add-item') {
      const projectName = interaction.options.getString('project');
      const itemName = interaction.options.getString('item');
      const quantity = interaction.options.getInteger('quantity');

      const { data: project } = await supabase
        .from('projects')
        .select('id')
        .ilike('name', projectName)
        .single();

      if (!project) return interaction.reply({ content: `❌ Project "${projectName}" not found.`, ephemeral: true });

      await supabase.from('project_items').insert({
        project_id: project.id,
        item_name: itemName,
        quantity_needed: quantity
      });

      return interaction.reply(`✅ Added **${quantity}x ${itemName}** to project **${projectName}**.`);
    }

    if (sub === 'complete') {
      const name = interaction.options.getString('name');

      const { data: project } = await supabase
        .from('projects')
        .select('id')
        .ilike('name', name)
        .single();

      if (!project) return interaction.reply({ content: `❌ Project "${name}" not found.`, ephemeral: true });

      await supabase.from('projects').update({
        status: 'completed',
        completed_at: new Date().toISOString()
      }).eq('id', project.id);

      return interaction.reply(`🎉 Project **${name}** marked as completed! Great work, FC!`);
    }
  }
};

function progressBar(current, total) {
  if (total === 0) return '▱▱▱▱▱▱▱▱▱▱';
  const filled = Math.round((current / total) * 10);
  return '▰'.repeat(filled) + '▱'.repeat(10 - filled);
}
