const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const supabase = require('../supabase');
const { flattenRecipe, getRecipe } = require('./claim');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('gather')
        .setDescription('See your full personal gathering list across all your active gather claims'),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        // Get all active gather claims for this user
        const { data: claims } = await supabase
            .from('claims')
            .select('*, projects(name)')
            .eq('discord_uid', interaction.user.id)
            .eq('status', 'active')
            .eq('claim_type', 'gather');

        if (!claims?.length) {
            return interaction.editReply('📭 You have no active gather claims. Use `/claim gather` to claim items you are gathering for.');
        }

        // For each claim, get the quantity needed and flatten the recipe
        const combinedMaterials = {};
        const failedItems = [];

        for (const claim of claims) {
            const baseItemName = claim.item_name.replace(/^[^-]+ - /, '');

            // Get quantity needed from project_items
            const { data: projectItem } = await supabase
                .from('project_items')
                .select('quantity_needed')
                .eq('project_id', claim.project_id)
                .ilike('item_name', claim.item_name)
                .single();

            if (!projectItem) continue;

            const recipe = await getRecipe(baseItemName);
            if (!recipe) {
                failedItems.push(baseItemName);
                continue;
            }

            const materials = await flattenRecipe(baseItemName, projectItem.quantity_needed);

            for (const [name, qty] of Object.entries(materials)) {
                combinedMaterials[name] = (combinedMaterials[name] || 0) + qty;
            }
        }

        if (!Object.keys(combinedMaterials).length && !failedItems.length) {
            return interaction.editReply('❌ Could not find recipes for any of your claimed items.');
        }

        // Sort by quantity descending
        const materialLines = Object.entries(combinedMaterials)
            .sort((a, b) => b[1] - a[1])
            .map(([name, qty]) => `• ${qty}x ${name}`);

        const claimLines = claims.map(c =>
            `• **${c.item_name}** for **${c.projects?.name || 'Unknown'}**`
        );

        const embed = new EmbedBuilder()
            .setTitle('⛏️ Your Gathering List')
            .setColor(0x57F287)
            .setTimestamp()
            .setFooter({ text: 'Only you can see this.' });

        embed.addFields({
            name: 'Active gather claims',
            value: claimLines.join('\n'),
            inline: false
        });

        // Chunk material lines in case there are a lot
        const chunks = chunkLines(materialLines, 1024);
        chunks.forEach((chunk, i) => {
            embed.addFields({
                name: i === 0 ? 'Raw materials to gather' : '\u200b',
                value: chunk,
                inline: false
            });
        });

        if (failedItems.length) {
            embed.addFields({
                name: '⚠️ Could not resolve recipes for',
                value: failedItems.map(i => `• ${i}`).join('\n'),
                inline: false
            });
        }

        return interaction.editReply({ embeds: [embed] });
    }
};

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