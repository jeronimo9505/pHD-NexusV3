'use server';

import { createClient } from "@/lib/supabase/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

// ─── CRUD OPERATIONS FOR NOTION LOGBOOK ──────────────────────────────

export async function getDocumentsAction(groupId: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Unauthorized' };

    const { data, error } = await (supabase as any)
        .from('logbook_documents')
        .select('id, group_id, user_id, title, content, is_starred, is_pinned, created_at, updated_at')
        .eq('group_id', groupId)
        .order('is_pinned', { ascending: false })
        .order('is_starred', { ascending: false })
        .order('updated_at', { ascending: false });

    if (error) {
        console.error('[logbook_actions] Error loading documents:', error);
        return { error: error.message };
    }
    return { data: data as any };
}

export async function saveDocumentAction(id: string, groupId: string, title: string, content: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Unauthorized' };

    const { data, error } = await (supabase as any)
        .from('logbook_documents')
        .upsert({
            id,
            group_id: groupId,
            user_id: user.id,
            title: title || 'Untitled Page',
            content: content || '',
            updated_at: new Date().toISOString()
        })
        .select()
        .single();

    if (error) {
        console.error('[logbook_actions] Error saving document:', error);
        return { error: error.message };
    }
    return { data: data as any };
}

export async function deleteDocumentAction(id: string, groupId: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Unauthorized' };

    const { error } = await (supabase as any)
        .from('logbook_documents')
        .delete()
        .eq('id', id)
        .eq('group_id', groupId);

    if (error) {
        console.error('[logbook_actions] Error deleting document:', error);
        return { error: error.message };
    }
    return { success: true };
}

export async function toggleStarDocumentAction(id: string, isStarred: boolean) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Unauthorized' };

    const { data, error } = await (supabase as any)
        .from('logbook_documents')
        .update({ is_starred: isStarred })
        .eq('id', id)
        .select()
        .single();

    if (error) {
        console.error('[logbook_actions] Error toggling star:', error);
        return { error: error.message };
    }
    return { data: data as any };
}

export async function togglePinDocumentAction(id: string, isPinned: boolean) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Unauthorized' };

    const { data, error } = await (supabase as any)
        .from('logbook_documents')
        .update({ is_pinned: isPinned })
        .eq('id', id)
        .select()
        .single();

    if (error) {
        console.error('[logbook_actions] Error toggling pin:', error);
        return { error: error.message };
    }
    return { data: data as any };
}

// ─── GEMINI AI ASSISTANT FOR LOGBOOK DOCUMENTS ────────────────────────

export async function askDocumentAIAction(input: {
    groupId: string;
    content: string;
    selection: string;
    instruction: 'improve' | 'format_latex' | 'summarize' | 'explain' | 'generate_tags' | 'custom';
    customPrompt?: string;
}) {
    const { groupId, content, selection, instruction, customPrompt } = input;

    // 1. Auth check
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Unauthorized' };

    // 2. Fetch group settings for custom API keys and model
    const { data: group } = await supabase
        .from('groups')
        .select('ai_settings')
        .eq('id', groupId)
        .single();

    const aiSettings = group?.ai_settings as { geminiApiKey?: string, model?: string } | null;
    const apiKey = aiSettings?.geminiApiKey || process.env.GOOGLE_GEMINI_API_KEY;

    if (!apiKey) {
        return { error: 'Gemini API key not configured. Add it in Group Settings or as GOOGLE_GEMINI_API_KEY in server environment.' };
    }

    let modelName = aiSettings?.model || 'gemini-1.5-flash';
    if (modelName.includes('2.5')) {
        console.warn(`[logbook_ai] Falling back from ${modelName} to gemini-1.5-flash.`);
        modelName = 'gemini-1.5-flash';
    }

    // 3. Initialize Gemini
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: `You are Nexus AI, an expert scientific writing and research assistant for a PHD laboratory logbook.
Your purpose is to help researchers polish notes, format formulas, write clear chemical or mathematical structures, and explain scientific concepts.
When rewriting or formatting text:
- Preserve all mathematical variables, units, experimental constants, and chemical formulas exactly.
- Return ONLY the final output or text without introductory or concluding remarks like "Sure! Here is the revised text:".
- Do NOT wrap your response in markdown code blocks unless the user explicitly requested code blocks or you are formatting code. If formatting a paragraph, return it as plain text.
- If asked to explain or summarize, output concise, scientifically dense, and clear responses.`,
    });

    const contextText = selection || content;
    if (!contextText.trim() && instruction !== 'custom') {
        return { error: 'The document or selection is empty.' };
    }

    // 4. Formulate the specific task prompt
    let prompt = '';
    switch (instruction) {
        case 'improve':
            prompt = `Improve the grammar, clarity, and phrasing of this scientific note to make it sound highly professional and academic. Do not lose any factual experimental data:
            
"${contextText}"`;
            break;
        case 'format_latex':
            prompt = `Convert physical formulas, math equations, and chemical species in this text to use clean subscript/superscript notation (e.g., Al_2O_3, 10^5) or LaTeX math blocks inside $...$ delimiters (e.g., $E = h \\cdot \\nu$ or $\\lambda = 532 nm$). Make it readable:
            
"${contextText}"`;
            break;
        case 'summarize':
            prompt = `Summarize this laboratory note in a dense, bullet-point format. Emphasize experimental parameters, samples used, measurements taken, and outcomes:
            
"${contextText}"`;
            break;
        case 'explain':
            prompt = `Explain the following scientific concepts, variables, or chemical formulas mentioned in this note:
            
"${contextText}"`;
            break;
        case 'generate_tags':
            prompt = `Analyze the note content and generate 3 to 6 highly relevant scientific hashtags (e.g., #SiO2, #Raman, #ThermalAnnealing, #PL). Return ONLY the space-separated list of hashtags, nothing else:
            
"${contextText}"`;
            break;
        case 'custom':
            prompt = `Fulfill the researcher's custom instruction: "${customPrompt}"
            
Context/Content to work on:
"${contextText}"`;
            break;
    }

    try {
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        return { success: true, text: text.trim() };
    } catch (err: any) {
        console.error('[logbook_ai] Gemini generation error:', err);
        return { error: err.message || 'Failed to generate AI response' };
    }
}
