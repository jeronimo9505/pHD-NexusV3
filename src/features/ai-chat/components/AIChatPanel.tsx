'use client';

import { useState, useRef, useEffect, useTransition, useCallback } from 'react';
import { sendAIChatMessageAction, getChatSessionsAction, getChatMessagesAction, createChatSessionAction, deleteChatSessionAction, type ChatMessage } from '../actions';
import { Bot, Send, Plus, Trash2, Sparkles, MessageSquare, ChevronLeft, Loader2, TestTube, FlaskConical, CheckSquare, BookOpen, BarChart2, Clock, AlertCircle, X } from 'lucide-react';

interface Session {
    id: string;
    title: string;
    created_at: string;
    updated_at: string;
}

interface AIChatPanelProps {
    groupId: string;
}

const QUICK_PROMPTS = [
    { icon: TestTube, label: '¿Qué muestras agregué esta semana?', prompt: '¿Qué muestras se agregaron esta semana al grupo?' },
    { icon: FlaskConical, label: 'Muestras con Raman', prompt: '¿Qué muestras tienen caracterización Raman?' },
    { icon: CheckSquare, label: 'Tareas pendientes', prompt: '¿Cuáles son las tareas pendientes del grupo?' },
    { icon: BarChart2, label: 'Estadísticas del grupo', prompt: 'Dame un resumen estadístico de todas las muestras del grupo.' },
    { icon: AlertCircle, label: 'Tareas vencidas', prompt: '¿Hay tareas vencidas en el grupo?' },
    { icon: BookOpen, label: 'Knowledge base', prompt: '¿Qué protocolos tiene registrados el grupo?' },
    { icon: Clock, label: 'Actividad reciente', prompt: '¿Cuál ha sido la actividad reciente del grupo?' },
];

function MarkdownMessage({ content }: { content: string }) {
    // Minimal markdown rendering: bold, code blocks, bullet lists, tables
    const lines = content.split('\n');
    const elements: React.ReactNode[] = [];
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];

        // Code block
        if (line.startsWith('```')) {
            let code = '';
            i++;
            while (i < lines.length && !lines[i].startsWith('```')) {
                code += lines[i] + '\n';
                i++;
            }
            elements.push(
                <pre key={i} className="bg-slate-900 border border-slate-700 rounded-lg p-3 my-2 overflow-x-auto text-xs font-mono text-emerald-300">
                    <code>{code.trim()}</code>
                </pre>
            );
            i++;
            continue;
        }

        // Table row
        if (line.startsWith('|') && line.endsWith('|')) {
            const tableLines: string[] = [line];
            i++;
            while (i < lines.length && lines[i].startsWith('|')) {
                tableLines.push(lines[i]);
                i++;
            }
            const rows = tableLines.filter(l => !l.match(/^\|[-| ]+\|$/));
            elements.push(
                <div key={i} className="overflow-x-auto my-2">
                    <table className="text-sm w-full border-collapse">
                        {rows.map((row, ri) => {
                            const cells = row.split('|').filter((_, ci) => ci !== 0 && ci !== row.split('|').length - 1);
                            return ri === 0 ? (
                                <thead key={ri}><tr className="border-b border-slate-600">
                                    {cells.map((c, ci) => <th key={ci} className="px-3 py-1.5 text-left text-slate-300 font-semibold whitespace-nowrap">{c.trim()}</th>)}
                                </tr></thead>
                            ) : (
                                <tbody key={ri}><tr className="border-b border-slate-800 hover:bg-slate-800/40">
                                    {cells.map((c, ci) => <td key={ci} className="px-3 py-1.5 text-slate-300 whitespace-nowrap">{c.trim()}</td>)}
                                </tr></tbody>
                            );
                        })}
                    </table>
                </div>
            );
            continue;
        }

        // Heading
        if (line.startsWith('### ')) {
            elements.push(<h3 key={i} className="font-semibold text-white mt-3 mb-1">{line.slice(4)}</h3>);
            i++; continue;
        }
        if (line.startsWith('## ')) {
            elements.push(<h2 key={i} className="font-bold text-white mt-3 mb-1 text-base">{line.slice(3)}</h2>);
            i++; continue;
        }

        // Bullet
        if (line.match(/^[-*]\s/)) {
            elements.push(
                <div key={i} className="flex gap-2 items-start my-0.5">
                    <span className="text-violet-400 mt-1 flex-shrink-0">•</span>
                    <span>{renderInline(line.slice(2))}</span>
                </div>
            );
            i++; continue;
        }

        // Numbered list
        if (line.match(/^\d+\.\s/)) {
            const num = line.match(/^(\d+)\.\s/)![1];
            elements.push(
                <div key={i} className="flex gap-2 items-start my-0.5">
                    <span className="text-violet-400 font-mono flex-shrink-0">{num}.</span>
                    <span>{renderInline(line.replace(/^\d+\.\s/, ''))}</span>
                </div>
            );
            i++; continue;
        }

        // Empty line
        if (!line.trim()) {
            elements.push(<div key={i} className="h-2" />);
            i++; continue;
        }

        // Normal paragraph
        elements.push(<p key={i} className="leading-relaxed">{renderInline(line)}</p>);
        i++;
    }

    return <div className="text-sm text-slate-200 space-y-0.5">{elements}</div>;
}

function renderInline(text: string): React.ReactNode {
    // Bold **text**
    const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
    return parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={i} className="text-white font-semibold">{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith('`') && part.endsWith('`')) {
            return <code key={i} className="bg-slate-800 px-1 py-0.5 rounded text-emerald-300 font-mono text-xs">{part.slice(1, -1)}</code>;
        }
        return part;
    });
}

export function AIChatPanel({ groupId }: AIChatPanelProps) {
    const [sessions, setSessions] = useState<Session[]>([]);
    const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [showSidebar, setShowSidebar] = useState(true);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);
    const [isPending, startTransition] = useTransition();
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Load sessions on mount
    useEffect(() => {
        getChatSessionsAction(groupId).then(res => {
            if (res.data) setSessions(res.data as Session[]);
        });
    }, [groupId]);

    // Auto-scroll
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isPending]);

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + 'px';
        }
    }, [input]);

    const loadSession = useCallback(async (sessionId: string) => {
        setIsLoadingHistory(true);
        setActiveSessionId(sessionId);
        const res = await getChatMessagesAction(sessionId);
        if (res.data) {
            setMessages(res.data.map((m: any) => ({ role: m.role, content: m.content, created_at: m.created_at })));
        }
        setIsLoadingHistory(false);
    }, []);

    const startNewChat = useCallback(() => {
        setActiveSessionId(null);
        setMessages([]);
        setInput('');
    }, []);

    const deleteSession = useCallback(async (sessionId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        await deleteChatSessionAction(sessionId);
        setSessions(prev => prev.filter(s => s.id !== sessionId));
        if (activeSessionId === sessionId) startNewChat();
    }, [activeSessionId, startNewChat]);

    const sendMessage = useCallback((messageText: string) => {
        const text = messageText.trim();
        if (!text || isPending) return;

        const userMsg: ChatMessage = { role: 'user', content: text, created_at: new Date().toISOString() };
        setMessages(prev => [...prev, userMsg]);
        setInput('');

        startTransition(async () => {
            const result = await sendAIChatMessageAction({
                groupId,
                sessionId: activeSessionId,
                message: text,
                history: messages,
            });

            if (result.error) {
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: `❌ Error: ${result.error}`,
                    created_at: new Date().toISOString()
                }]);
                return;
            }

            if (result.sessionId && !activeSessionId) {
                setActiveSessionId(result.sessionId);
                // Reload sessions list
                getChatSessionsAction(groupId).then(res => {
                    if (res.data) setSessions(res.data as Session[]);
                });
            }

            setMessages(prev => [...prev, {
                role: 'assistant',
                content: result.message!,
                created_at: new Date().toISOString()
            }]);
        });
    }, [isPending, groupId, activeSessionId, messages]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage(input);
        }
    };

    const isEmpty = messages.length === 0;

    return (
        <div className="flex h-full bg-slate-950 overflow-hidden">
            {/* Sidebar — Chat History */}
            <div className={`flex-shrink-0 flex flex-col border-r border-slate-800 bg-slate-900 transition-all duration-300 ${showSidebar ? 'w-64' : 'w-0 overflow-hidden'}`}>
                <div className="p-4 border-b border-slate-800 flex items-center justify-between flex-shrink-0">
                    <div className="flex items-center gap-2">
                        <Sparkles size={16} className="text-violet-400" />
                        <span className="text-sm font-semibold text-white">Nexus AI</span>
                    </div>
                    <button onClick={() => setShowSidebar(false)} className="p-1 text-slate-500 hover:text-white rounded transition-colors">
                        <ChevronLeft size={16} />
                    </button>
                </div>

                <div className="p-3 flex-shrink-0">
                    <button
                        onClick={startNewChat}
                        className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors"
                    >
                        <Plus size={16} />
                        Nueva conversación
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1">
                    {sessions.length === 0 && (
                        <p className="text-xs text-slate-600 text-center px-3 py-4">Sin conversaciones aún</p>
                    )}
                    {sessions.map(session => (
                        <div
                            key={session.id}
                            onClick={() => loadSession(session.id)}
                            className={`group flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${activeSessionId === session.id
                                ? 'bg-violet-600/20 border border-violet-600/30 text-white'
                                : 'hover:bg-slate-800 text-slate-400 hover:text-white'
                                }`}
                        >
                            <MessageSquare size={14} className="flex-shrink-0 text-slate-500" />
                            <span className="text-xs flex-1 truncate">{session.title}</span>
                            <button
                                onClick={(e) => deleteSession(session.id, e)}
                                className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-500 hover:text-red-400 transition-all flex-shrink-0"
                            >
                                <Trash2 size={12} />
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            {/* Main Chat Area */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Top bar */}
                <div className="h-14 flex items-center gap-3 px-4 border-b border-slate-800 bg-slate-900/50 flex-shrink-0">
                    {!showSidebar && (
                        <button
                            onClick={() => setShowSidebar(true)}
                            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                        >
                            <MessageSquare size={18} />
                        </button>
                    )}
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center flex-shrink-0">
                            <Bot size={16} className="text-white" />
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-white">Nexus AI</p>
                            <p className="text-[10px] text-slate-500">Conectado a tu base de datos</p>
                        </div>
                    </div>
                    <div className="ml-auto flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="text-[10px] text-slate-500">Gemini 1.5 Flash</span>
                    </div>
                </div>

                {/* Messages area */}
                <div className="flex-1 overflow-y-auto">
                    {isLoadingHistory ? (
                        <div className="flex items-center justify-center h-full">
                            <div className="flex items-center gap-2 text-slate-500">
                                <Loader2 size={18} className="animate-spin" />
                                <span className="text-sm">Cargando conversación...</span>
                            </div>
                        </div>
                    ) : isEmpty ? (
                        /* Welcome / Empty State */
                        <div className="flex flex-col items-center justify-center h-full px-6 py-10">
                            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center mb-6 shadow-[0_0_60px_rgba(139,92,246,0.3)]">
                                <Sparkles size={36} className="text-white" />
                            </div>
                            <h2 className="text-2xl font-bold text-white mb-2">Nexus AI</h2>
                            <p className="text-slate-400 text-center mb-8 max-w-md">
                                Tu asistente de investigación con acceso a muestras, tareas, reportes y knowledge base del grupo.
                            </p>

                            <div className="grid grid-cols-2 gap-2 w-full max-w-xl">
                                {QUICK_PROMPTS.map((qp, i) => (
                                    <button
                                        key={i}
                                        onClick={() => sendMessage(qp.prompt)}
                                        className="flex items-center gap-3 px-4 py-3 bg-slate-800/70 hover:bg-slate-800 border border-slate-700/50 hover:border-violet-500/30 rounded-xl text-left text-sm text-slate-300 hover:text-white transition-all group"
                                    >
                                        <qp.icon size={16} className="text-violet-400 flex-shrink-0 group-hover:scale-110 transition-transform" />
                                        <span className="leading-tight">{qp.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
                            {messages.map((msg, idx) => (
                                <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    {msg.role === 'assistant' && (
                                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center flex-shrink-0 mt-1">
                                            <Bot size={14} className="text-white" />
                                        </div>
                                    )}
                                    <div className={`max-w-[80%] ${msg.role === 'user'
                                        ? 'bg-violet-600/20 border border-violet-500/20 rounded-2xl rounded-tr-sm px-4 py-3 text-sm text-white'
                                        : 'bg-slate-800/60 border border-slate-700/50 rounded-2xl rounded-tl-sm px-4 py-3'
                                        }`}>
                                        {msg.role === 'assistant' ? (
                                            <MarkdownMessage content={msg.content} />
                                        ) : (
                                            <p className="text-sm text-white leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                                        )}
                                        {msg.created_at && (
                                            <p className={`text-[10px] mt-1.5 ${msg.role === 'user' ? 'text-violet-400/60 text-right' : 'text-slate-600'}`}>
                                                {new Date(msg.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                                            </p>
                                        )}
                                    </div>
                                    {msg.role === 'user' && (
                                        <div className="w-8 h-8 rounded-lg bg-slate-700 flex items-center justify-center flex-shrink-0 mt-1">
                                            <span className="text-xs font-bold text-white">Tú</span>
                                        </div>
                                    )}
                                </div>
                            ))}

                            {/* Typing indicator */}
                            {isPending && (
                                <div className="flex gap-3 justify-start">
                                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center flex-shrink-0">
                                        <Bot size={14} className="text-white" />
                                    </div>
                                    <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl rounded-tl-sm px-4 py-3">
                                        <div className="flex items-center gap-1">
                                            <div className="w-2 h-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                                            <div className="w-2 h-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                                            <div className="w-2 h-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                                        </div>
                                    </div>
                                </div>
                            )}
                            <div ref={messagesEndRef} />
                        </div>
                    )}
                </div>

                {/* Input Area */}
                <div className="bg-slate-900/50 border-t border-slate-800 p-4 flex-shrink-0">
                    <div className="max-w-3xl mx-auto">
                        <div className="flex gap-3 items-end bg-slate-800 border border-slate-700 focus-within:border-violet-500/50 rounded-2xl px-4 py-3 transition-colors">
                            <textarea
                                ref={textareaRef}
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Pregunta algo sobre tus muestras, tareas o reportes..."
                                rows={1}
                                disabled={isPending}
                                className="flex-1 bg-transparent text-sm text-white placeholder-slate-500 resize-none outline-none leading-relaxed disabled:opacity-50"
                                style={{ maxHeight: '160px' }}
                            />
                            <button
                                onClick={() => sendMessage(input)}
                                disabled={!input.trim() || isPending}
                                className="w-9 h-9 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:bg-slate-700 disabled:text-slate-600 flex items-center justify-center text-white flex-shrink-0 transition-all hover:scale-105 active:scale-95 disabled:scale-100"
                            >
                                {isPending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                            </button>
                        </div>
                        <p className="text-[10px] text-slate-600 text-center mt-2">
                            Nexus AI puede cometer errores. Verifica información crítica de laboratorio.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
