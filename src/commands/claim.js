const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const supabase = require('../supabase');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('claim')
    .setDescription('Claim that you are farming or crafting an item for a project')
    .addStringOption(opt =>
      opt.setName('project').setDescription('Project name').setRequired(true))
    .addStringOption(opt =>
      opt.setName('item').setDescription('Item name you are working on').setRequired(true))
    .addIntegerOption(opt =>
      opt.setName('quantity').setDescription('How many you are making/farming').setRequired(true)),

  async execute(interaction) {
    const projectName = interaction.options.getString('project');
    const itemName = interaction.options.getString('item');
    const quantity = interaction.options.getInteger('quantity');

    const { data: project } = await supabase
      .from('projects')
      .select('id, name')
      .ilike('name', projectName)
      .eq('status', 'active')
      .single();

    if (!project) {
      return interaction.reply({ content: `❌ No active project found named "${projectName}".`, ephemeral: true });
    }

    // Check if this item is actually needed for the project
    const { data: projectItem } = await supabase
      .from('project_items')
      .select('quantity_needed')
      .eq('project_id', project.id)
      .ilike('item_name', itemName)
      .single();

    if (!projectItem) {
      return interaction.reply({ content: `❌ "${itemName}" is not a required item for **${project.name}**.`, ephemeral: true });
    }

    // Check for existing active claim by this user on this item
    const { data: existing } = await supabase
      .from('claims')
      .select('id, quantity')
      .eq('project_id', project.id)
      .ilike('item_name', itemName)
      .eq('discord_uid', interaction.user.id)
      .eq('status', 'active')
      .single();

    if (existing) {
      // Update existing claim
      await supabase
        .from('claims')
        .update({ quantity })
        .eq('id', existing.id);

      return interaction.reply(`🔄 Updated your claim on **${itemName}** for **${project.name}** to **${quantity}x**.`);
    }

    await supabase.from('claims').insert({
      project_id: project.id,
      item_name: itemName,
      quantity,
      discord_user: interaction.user.username,
      discord_uid: interaction.user.id
    });

    return interaction.reply(`⚒️ <@${interaction.user.id}> claimed **${quantity}x ${itemName}** for project **${project.name}**!`);
  }
};
