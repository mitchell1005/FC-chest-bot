const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const supabase = require('../supabase');

const XIVAPI_BASE = 'https://v2.xivapi.com';

async function getRecipe(itemName) {
  try {
    // Search for the recipe by item name
    const searchRes = await fetch(
      `${XIVAPI_BASE}/api/search?sheets=Recipe&query=ItemResult.Name~"${encodeURIComponent(itemName)}"&fields=ItemResult.Name,AmountResult,Ingredient,AmountIngredient&limit=1`
    );
    const searchData = await searchRes.json();
    const recipe = searchData.results?.[0]?.fields;
    if (!recipe) return null;

    const ingredients = [];
    const ingArray = recipe.Ingredient || [];
    const amtArray = recipe.AmountIngredient || [];

    for (let i = 0; i < ingArray.length; i++) {
      const name = ingArray[i]?.fields?.Name;
      const qty = amtArray[i];
      if (name && qty > 0) {
        ingredients.push({ name, quantity: qty });
      }
    }

    return {
      name: recipe.ItemResult?.fields?.Name || itemName,
      yields: recipe.AmountResult || 1,
      ingredients
    };
  } catch (err) {
    console.error('Recipe lookup failed:', err);
    return null;
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('claim')
    .setDescription('Claim an item for a project')
    .addSubcommand(sub =>
      sub.setName('craft')
        .setDescription('Claim you are crafting an item')
        .addStringOption(opt =>
          opt.setName('project').setDescription('Project name').setRequired(true))
        .addStringOption(opt =>
          opt.setName('item').setDescription('Item name').setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('gather')
        .setDescription('Claim you are gathering materials for an item')
        .addStringOption(opt =>
          opt.setName('project').setDescription('Project name').setRequired(true))
        .addStringOption(opt =>
          opt.setName('item').setDescription('Item name').setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('drop')
        .setDescription('Drop your claim on an item')
        .addStringOption(opt =>
          opt.setName('project').setDescription('Project name').setRequired(true))
        .addStringOption(opt =>
          opt.setName('item').setDescription('Item name').setRequired(true))),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'craft' || sub === 'gather') {
      const projectName = interaction.options.getString('project');
      const itemName = interaction.options.getString('item');

      const { data: project } = await supabase
        .from('projects')
        .select('id, name')
        .ilike('name', projectName)
        .eq('status', 'active')
        .single();

      if (!project) {
        return interaction.reply({ content: `❌ No active project found named "${projectName}".`, ephemeral: true });
      }

      // Check item exists in project
      const { data: projectItem } = await supabase
        .from('project_items')
        .select('quantity_needed')
        .eq('project_id', project.id)
        .ilike('item_name', itemName)
        .single();

      if (!projectItem) {
        return interaction.reply({ content: `❌ "${itemName}" is not a required item for **${project.name}**.`, ephemeral: true });
      }

      // Check if already claimed by anyone
      const { data: existing } = await supabase
        .from('claims')
        .select('id, discord_user, discord_uid, claim_type')
        .eq('project_id', project.id)
        .ilike('item_name', itemName)
        .eq('status', 'active')
        .maybeSingle();

      if (existing) {
        if (existing.discord_uid === interaction.user.id) {
          return interaction.reply({ content: `❌ You already have a claim on **${itemName}**. Use \`/claim drop\` first.`, ephemeral: true });
        }
        return interaction.reply({ content: `❌ **${itemName}** is already claimed by **${existing.discord_user}**.`, ephemeral: true });
      }

      await supabase.from('claims').insert({
        project_id: project.id,
        item_name: itemName,
        quantity: 1,
        discord_user: interaction.user.username,
        discord_uid: interaction.user.id,
        claim_type: sub
      });

      if (sub === 'craft') {
        return interaction.reply(`⚒️ <@${interaction.user.id}> is now crafting **${itemName}** for **${project.name}**!`);
      }

      // Gather — look up recipe and show gathering list
      await interaction.deferReply({ ephemeral: true });

      const baseItemName = itemName.replace(/^[^-]+ - /, '');
      const recipe = await getRecipe(baseItemName);

      if (!recipe) {
        return interaction.editReply(`⛏️ Claimed gathering for **${itemName}** but couldn't find a recipe automatically. Check the ingredients manually.`);
      }

      const neededQty = projectItem.quantity_needed;
      const batches = Math.ceil(neededQty / recipe.yields);

      const embed = new EmbedBuilder()
        .setTitle(`⛏️ Gathering List — ${baseItemName}`)
        .setColor(0x57F287)
        .setDescription(`You need **${neededQty}x ${baseItemName}** — that's **${batches} batch${batches !== 1 ? 'es' : ''}** of ${recipe.yields}.`)
        .addFields({
          name: 'Materials to gather',
          value: recipe.ingredients
            .map(i => `• ${i.quantity * batches}x ${i.name}`)
            .join('\n'),
          inline: false
        })
        .setFooter({ text: 'Only you can see this message.' });

      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === 'drop') {
      const projectName = interaction.options.getString('project');
      const itemName = interaction.options.getString('item');

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
        .maybeSingle();

      if (!claim) {
        return interaction.reply({ content: `❌ You don't have an active claim on "${itemName}" in "${projectName}".`, ephemeral: true });
      }

      await supabase.from('claims')
        .update({ status: 'fulfilled', fulfilled_at: new Date().toISOString() })
        .eq('id', claim.id);

      return interaction.reply(`✅ Dropped your claim on **${itemName}** for **${projectName}**.`);
    }
  }
};