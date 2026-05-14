const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const supabase = require('../supabase');

const XIVAPI_BASE = 'https://v2.xivapi.com';

// Cache recipes to avoid redundant API calls within the same command execution
const recipeCache = {};

async function getRecipe(itemName) {
  if (recipeCache[itemName.toLowerCase()]) return recipeCache[itemName.toLowerCase()];

  try {
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

    const result = {
      name: recipe.ItemResult?.fields?.Name || itemName,
      yields: recipe.AmountResult || 1,
      ingredients
    };

    recipeCache[itemName.toLowerCase()] = result;
    return result;
  } catch (err) {
    console.error(`Recipe lookup failed for "${itemName}":`, err);
    return null;
  }
}

// Recursively flatten a recipe down to raw materials
// Returns a map of { itemName: totalQuantity } for only raw materials
async function flattenRecipe(itemName, quantityNeeded, multiplier = 1) {
  const recipe = await getRecipe(itemName);

  if (!recipe || recipe.ingredients.length === 0) {
    // This is a raw material — no recipe found
    return { [itemName]: quantityNeeded * multiplier };
  }

  const batches = Math.ceil(quantityNeeded / recipe.yields);
  const rawMaterials = {};

  for (const ingredient of recipe.ingredients) {
    const subMaterials = await flattenRecipe(
      ingredient.name,
      ingredient.quantity * batches,
      multiplier
    );

    for (const [name, qty] of Object.entries(subMaterials)) {
      rawMaterials[name] = (rawMaterials[name] || 0) + qty;
    }
  }

  return rawMaterials;
}

// Build a full gathering list for a given item and quantity needed
async function buildGatheringList(baseItemName, quantityNeeded) {
  const recipe = await getRecipe(baseItemName);
  if (!recipe) return null;

  const batches = Math.ceil(quantityNeeded / recipe.yields);
  const rawMaterials = await flattenRecipe(baseItemName, quantityNeeded);

  return { recipe, batches, rawMaterials };
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

      // Gather — recursively flatten recipe and show gathering list
      await interaction.deferReply({ ephemeral: true });

      const baseItemName = itemName.replace(/^[^-]+ - /, '');
      const result = await buildGatheringList(baseItemName, projectItem.quantity_needed);

      if (!result) {
        return interaction.editReply(`⛏️ Claimed gathering for **${itemName}** but couldn't find a recipe. Check ingredients manually.`);
      }

      const { recipe, batches, rawMaterials } = result;
      const materialLines = Object.entries(rawMaterials)
        .sort((a, b) => b[1] - a[1])
        .map(([name, qty]) => `• ${qty}x ${name}`);

      const embed = new EmbedBuilder()
        .setTitle(`⛏️ Gathering List — ${baseItemName}`)
        .setColor(0x57F287)
        .setDescription(`You need **${projectItem.quantity_needed}x ${baseItemName}** (${batches} batch${batches !== 1 ? 'es' : ''} of ${recipe.yields})`)
        .addFields({
          name: 'Raw materials to gather',
          value: materialLines.join('\n') || 'No materials found.',
          inline: false
        })
        .setFooter({ text: 'Only you can see this. Use /gather to see your full list.' });

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
  },

  // Export helpers so gather.js can reuse them
  buildGatheringList,
  flattenRecipe,
  getRecipe
};