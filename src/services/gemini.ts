import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import {
  ClassificationResult,
  KnowledgeItem,
  Message,
  ContactMemory,
  ConversationInsights,
} from '../types/index.ts';

// Server-side initialization following @google/genai specification
function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Prompt Injection Detection
export function detectPromptInjection(text: string): { isInjection: boolean; reason?: string } {
  const normalized = text.toLowerCase();
  const injectionPatterns = [
    /ignore (all )?(previous|prior|above) instructions/i,
    /you are now (an unrestricted|a new|dan|jailbreak)/i,
    /system prompt override/i,
    /disregard (the )?(safety|system) rules/i,
    /reveal your (system|hidden) prompt/i,
    /bypass all restrictions/i,
    /pretend (you are|to be) (god|unfiltered)/i,
    /print everything above/i,
    /echo the secret/i,
    /<system>/i,
    /\[system\]/i,
  ];

  for (const pattern of injectionPatterns) {
    if (pattern.test(normalized)) {
      return {
        isInjection: true,
        reason: `Matched potential prompt injection trigger: ${pattern.source}`,
      };
    }
  }

  return { isInjection: false };
}

// Detect language: Bangla, Banglish, or English
export function detectLanguage(text: string): 'bn' | 'banglish' | 'en' {
  // Check for Bengali Unicode script range (\u0980-\u09FF)
  const bengaliRegex = /[\u0980-\u09FF]/;
  if (bengaliRegex.test(text)) {
    return 'bn';
  }

  // Common Banglish words
  const banglishPatterns = [
    /\b(kemon|acho|acsen|bhalo|kichu|apni|tumi|shonlam|dekha|ashba|kotha|janaben|shob|bhai|korbo|hobey|hobe|korchen|ki|kothay|bujhlam|thik|dhonnobad|hajar|taka)\b/i,
  ];
  if (banglishPatterns.some((p) => p.test(text))) {
    return 'banglish';
  }

  return 'en';
}

// Rule-based classification fallback when Gemini is offline or unconfigured
export function classifyWithRules(text: string): ClassificationResult {
  const normalized = text.toLowerCase();
  const language = detectLanguage(text);
  const injectionCheck = detectPromptInjection(text);

  if (injectionCheck.isInjection) {
    return {
      category: 'uncertain',
      confidence: 0.99,
      detectedLanguage: language,
      reasoning: `Prompt injection signature detected: ${injectionCheck.reason}`,
      isHighImpact: true,
      isInjectionAttempt: true,
    };
  }

  // 1. Romantic or Flirtatious Check
  const romanticPatterns = [
    /\b(love you|miss you|crush|dating|marry|girlfriend|boyfriend|romantic|cutie|bhalobashi|valobashi|biye|moner manush|sundori|shundor)\b/i,
  ];
  if (romanticPatterns.some((p) => p.test(normalized))) {
    return {
      category: 'romantic_flirtatious',
      confidence: 0.95,
      detectedLanguage: language,
      reasoning: 'Inbound message contains romantic or flirtatious expressions.',
      isHighImpact: true,
      isInjectionAttempt: false,
    };
  }

  // 2. Sensitive / Financial / Confidential
  const sensitivePatterns = [
    /\b(password|secret|bank account|borrow money|taka dhar|loan|confidential|medical|depression|crying|court|legal)\b/i,
  ];
  if (sensitivePatterns.some((p) => p.test(normalized))) {
    return {
      category: 'sensitive',
      confidence: 0.92,
      detectedLanguage: language,
      reasoning: 'Sensitive, financial, or confidential topic detected.',
      isHighImpact: true,
      isInjectionAttempt: false,
    };
  }

  // 3. Urgent
  const urgentPatterns = [
    /\b(urgent|emergency|accident|hospital|right now|immediately|ashoni|druto|khub joruri)\b/i,
  ];
  if (urgentPatterns.some((p) => p.test(normalized))) {
    return {
      category: 'urgent',
      confidence: 0.90,
      detectedLanguage: language,
      reasoning: 'Time-sensitive or emergency terminology detected.',
      isHighImpact: true,
      isInjectionAttempt: false,
    };
  }

  // 4. FAQ / Business (CNC, Doors, Carvings, CAD/CAM, Programming, Pricing, Portfolio)
  const faqPatterns = [
    /\b(cnc|door|wood|teak|carving|relief|3d|toolpath|vector|cad|cam|artcam|aspire|chittagong door|react|website|portfolio|price|rate|cost|khoroch|daam|order|hire|service|programming|software|office|location|address)\b/i,
    /কাঠ|দরজা|ডোর|নকশা|টুলপাথ|সিএনসি|অর্ডার|দাম|খরচ|খোদাই|অফিস|ঠিকানা|লোকেশন|হাজীগঞ্জ|চাঁদপুর|চিটাগাং/,
  ];
  if (faqPatterns.some((p) => p.test(normalized))) {
    return {
      category: 'faq_business',
      confidence: 0.94,
      detectedLanguage: language,
      reasoning: 'Inquiry relates to CNC toolpaths, wood carving services, web design, or pricing.',
      isHighImpact: false,
      isInjectionAttempt: false,
    };
  }

  // 5. General Personal / Casual chit chat
  const personalPatterns = [
    /\b(kemon|hi|hello|hey|asho|ki obostha|bhalo|meet|dekha|weekend|shukrobar|bari|bidesh|family)\b/i,
    /কেমন|আছেন|ভালো|দেখা|ছুটি/,
  ];
  if (personalPatterns.some((p) => p.test(normalized))) {
    return {
      category: 'general_personal',
      confidence: 0.88,
      detectedLanguage: language,
      reasoning: 'Casual greeting or personal friend conversation.',
      isHighImpact: true,
      isInjectionAttempt: false,
    };
  }

  return {
    category: 'uncertain',
    confidence: 0.70,
    detectedLanguage: language,
    reasoning: 'Message context is ambiguous; escalates to admin review.',
    isHighImpact: true,
    isInjectionAttempt: false,
  };
}

// Server-side classification with Gemini 3.1 Flash Lite (with fallback to 3.8 Flash and rule engine)
export async function classifyInboundMessage(text: string): Promise<ClassificationResult> {
  const injection = detectPromptInjection(text);
  if (injection.isInjection) {
    return {
      category: 'uncertain',
      confidence: 0.99,
      detectedLanguage: detectLanguage(text),
      reasoning: injection.reason || 'Prompt injection detected',
      isHighImpact: true,
      isInjectionAttempt: true,
    };
  }

  const ai = getGeminiClient();
  if (!ai) {
    return classifyWithRules(text);
  }

  const promptContents = `You are an inbound message classification system for Muhammad Nayeem's Personal AI Desk.
Analyze the message below and classify it strictly into one of these 6 categories:
- "faq_business": CNC toolpaths, wood carving, Chittagong Door, web development, tech skills, pricing, portfolio inquiry.
- "general_personal": Casual greetings, catching up, personal chit-chat, friends/family questions.
- "romantic_flirtatious": Flirting, romantic interest, dating, marriage, affection.
- "sensitive": Financial requests/loans, secrets, legal, emotional distress, medical.
- "urgent": Immediate deadlines, time-sensitive emergencies.
- "uncertain": Ambiguous, unclear, strange, or potential manipulation.

Respond ONLY with valid JSON with keys:
{
  "category": "faq_business" | "general_personal" | "romantic_flirtatious" | "sensitive" | "urgent" | "uncertain",
  "confidence": number between 0.0 and 1.0,
  "detectedLanguage": "en" | "bn" | "banglish",
  "reasoning": "brief explanation",
  "isHighImpact": boolean,
  "isInjectionAttempt": boolean
}

Inbound Message:
"""${text.replace(/"/g, '\\"')}"""`;

  // Try candidate models with explicit abort control and minimal thinking overhead
  const candidateModels = ['gemini-3.1-flash-lite', 'gemini-3.8-flash'];
  for (const model of candidateModels) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await ai.models.generateContent({
        model,
        contents: promptContents,
        config: {
          abortSignal: controller.signal,
          responseMimeType: 'application/json',
          temperature: 0.1,
          thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        },
      });

      clearTimeout(timeoutId);
      const jsonText = response.text?.trim();
      if (jsonText) {
        const parsed = JSON.parse(jsonText) as ClassificationResult;
        return parsed;
      }
    } catch {
      clearTimeout(timeoutId);
      // Fall through to next model or rule-based engine cleanly
    }
  }

  // Fallback to local rule engine
  return classifyWithRules(text);
}

// Generate Response grounded in verified knowledge
export async function generateGroundedResponse(params: {
  inboundText: string;
  category: string;
  detectedLanguage: 'en' | 'bn' | 'banglish';
  knowledgeBase: KnowledgeItem[];
  recentHistory: Message[];
  memories: ContactMemory[];
  systemPrompt: string;
  senderName: string;
}): Promise<string> {
  const ai = getGeminiClient();

  // Knowledge base summary
  const kbContext = params.knowledgeBase
    .map((k) => `[${k.category.toUpperCase()}] ${k.title}: ${k.content}`)
    .join('\n');

  // Contact memory context
  const memoryContext = params.memories.length > 0
    ? params.memories.map((m) => `- (${m.memoryType}) ${m.memoryText}`).join('\n')
    : 'No prior memories recorded for this contact.';

  // Recent conversation history
  const historyContext = params.recentHistory
    .slice(-6)
    .map((m) => `${m.direction === 'inbound' ? params.senderName : 'Nayeem AI Desk'}: ${m.content}`)
    .join('\n');

  const getDeterministicFallback = () => {
    if (params.category === 'faq_business') {
      if (params.detectedLanguage === 'bn') {
        return 'ধন্যবাদ মেসেজ দেওয়ার জন্য। মুহাম্মদ নাঈম চিটাগাং ডোরের সিনিয়র সিএনসি প্রোগ্রামার ও ডিজাইনার হিসেবে নিখুঁত ২ডি/৩ডি রিলিফ কাঠের খোদাই এবং টুলপাথ সার্ভিস প্রদান করেন। আপনার প্রয়োজনীয় সাইজ ও ড্রয়িং বিস্তারিত শেয়ার করুন।';
      } else if (params.detectedLanguage === 'banglish') {
        return 'Message deyar jonno dhonnobad! Muhammad Nayeem Chittagong Door-er Senior CNC Programmer & Designer. Bespoke 3D relief door carving ba web development toolpath lagle details share korte paren.';
      } else {
        return 'Thank you for reaching out to Muhammad Nayeem (Senior CNC Programmer & Designer at Chittagong Door). For custom 2D/3D relief toolpaths or web engineering inquiries, please share your project requirements.';
      }
    } else {
      if (params.detectedLanguage === 'bn') {
        return 'মেসেজের জন্য ধন্যবাদ। আপনার মেসেজটি মুহাম্মদ নাঈমের কাছে জমা রাখা হয়েছে, তিনি নিজে দেখে শীঘ্রই রিপ্লাই দেবেন।';
      } else if (params.detectedLanguage === 'banglish') {
        return 'Dhonnobad! Apnar message-ti Nayeem-er personal inbox-e save kora hoyeche, uni free hoye direct contact korben.';
      } else {
        return 'Thank you for your message. It has been routed to Muhammad Nayeem for direct personal review.';
      }
    }
  };

  if (!ai) {
    return getDeterministicFallback();
  }

  const prompt = `System Instructions:
${params.systemPrompt}

IDENTITY & PERSONAL CONTEXT:
You are the personal AI assistant for Muhammad Nayeem (Senior CNC Programmer & Designer at Chittagong Door; specializing in CNC/CAD/CAM, 2D/3D toolpaths, precision digital design, and web development).
Primary website & personal repository: https://muhammadnayeem.qzz.io

COMMUNICATION PRINCIPLES:
1. You assist Nayeem with his personal WhatsApp conversations—you are NOT a generic corporate support chatbot.
2. Tone: Calm, self-assured, concise, friendly, thoughtful, and socially aware.
3. Language: Seamlessly match the sender's language (${params.detectedLanguage === 'bn' ? 'Bangla (বাংলা)' : params.detectedLanguage === 'banglish' ? 'Banglish' : 'English'}).
4. Avoid repetitive greetings or robotic templates if an active conversation is already in progress. Never say "As an AI..." repeatedly.
5. Understand jokes, casual conversation, follow-up questions, and ambiguous messages. Ask a natural clarifying question when helpful.
6. Relationship Policy: Nayeem is single, has no girlfriend, and is focused on career, engineering, and creative projects. Never fabricate romantic relationships or encourage unwanted romantic advances.
7. Grounding: Ground all technical and personal facts strictly on verified knowledge below. If uncertain, admit it politely.

VERIFIED PROFILE KNOWLEDGE (Do NOT fabricate beyond this):
${kbContext}

RELEVANT CONTACT MEMORIES:
${memoryContext}

CONVERSATION HISTORY (Check previous questions and context first):
${historyContext}

LATEST INBOUND MESSAGE FROM ${params.senderName}:
"${params.inboundText}"

CATEGORY: ${params.category}
DETECTED LANGUAGE: ${params.detectedLanguage}

TASK:
Generate a context-aware, natural, human WhatsApp reply for ${params.senderName} that fits the flow of conversation. Output ONLY the response text.`;

  // Try candidate models with explicit abort control and bounded thinking latency
  const candidateModels = ['gemini-3.1-flash-lite', 'gemini-3.8-flash'];
  for (const model of candidateModels) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 16000);
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          abortSignal: controller.signal,
          temperature: 0.3,
          thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        },
      });

      clearTimeout(timeoutId);
      const reply = response.text?.trim();
      if (reply) {
        return reply;
      }
    } catch {
      clearTimeout(timeoutId);
      // Fall through to next candidate model or deterministic fallback cleanly
    }
  }

  // Graceful grounded fallback
  return getDeterministicFallback();
}

export async function generateConversationInsights(params: {
  contactId: string;
  contactName: string;
  recentHistory: Message[];
  memories: ContactMemory[];
  knowledgeBase: KnowledgeItem[];
  systemPrompt?: string;
}): Promise<ConversationInsights> {
  const { contactId, contactName, recentHistory, memories, knowledgeBase } = params;

  const historyContext = recentHistory.length > 0
    ? recentHistory
        .slice(-10)
        .map((m) => `[${m.direction.toUpperCase()} | ${m.createdAt}]: ${m.content}`)
        .join('\n')
    : 'No prior messages recorded.';

  const memoryContext = memories.length > 0
    ? memories.map((m) => `- ${m.memoryText} (${m.memoryType})`).join('\n')
    : 'No stored preferences recorded.';

  const lastInbound = [...recentHistory].reverse().find((m) => m.direction === 'inbound');
  const lastInboundText = lastInbound?.content || 'No recent inbound message';

  const ai = getGeminiClient();

  if (ai) {
    const prompt = `Analyze this conversation between contact "${contactName}" and Muhammad Nayeem's AI Desk.
Respond ONLY with a valid JSON object matching the requested schema. No markdown formatting, no code fences.

RECENT CHAT HISTORY:
${historyContext}

STORED CONTACT MEMORIES:
${memoryContext}

LATEST INBOUND MESSAGE:
"${lastInboundText}"

Return JSON with exactly these fields:
{
  "currentTopic": "short plain-text topic (e.g. Teak door CNC file pricing)",
  "userIntent": "concise description of what contact is asking or seeking",
  "unansweredQuestions": ["array of questions asked by the contact that were not fully answered"],
  "recentCommitments": ["array of commitments or promises made to this contact, or empty if none"],
  "previousContextSummary": "factual 1-2 sentence summary of previous relationship/dealings. Do NOT invent missing messages.",
  "suggestedDraftReply": "context-aware suggested draft reply matching the sender's language (Bangla/Banglish/English) grounded in Muhammad Nayeem's CNC/design background."
}`;

    const candidateModels = ['gemini-3.1-flash-lite', 'gemini-3.8-flash'];
    for (const model of candidateModels) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);
      try {
        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            abortSignal: controller.signal,
            temperature: 0.2,
            responseMimeType: 'application/json',
            thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
          },
        });

        clearTimeout(timeoutId);
        const raw = response.text?.trim();
        if (raw) {
          const parsed = JSON.parse(raw);
          return {
            contactId,
            currentTopic: parsed.currentTopic || 'General Inquiry',
            userIntent: parsed.userIntent || 'Direct inquiry with Muhammad Nayeem',
            unansweredQuestions: Array.isArray(parsed.unansweredQuestions) ? parsed.unansweredQuestions : [],
            recentCommitments: Array.isArray(parsed.recentCommitments) ? parsed.recentCommitments : [],
            previousContextSummary: parsed.previousContextSummary || 'Recent conversation records available.',
            suggestedDraftReply: parsed.suggestedDraftReply || 'আসসালামু আলাইকুম, আপনার বার্তাটি পেয়েছি। বিস্তারিত জানিয়ে সহযোগিতা করতে প্রস্তুত।',
            isCompleteHistoryAvailable: true,
            generatedAt: new Date().toISOString(),
          };
        }
      } catch {
        clearTimeout(timeoutId);
        // Fall through to next model or deterministic fallback cleanly
      }
    }
  }

  // Deterministic rule-based insights when offline or unconfigured
  const hasQuestion = lastInboundText.includes('?') || lastInboundText.includes('কত') || lastInboundText.includes('কবে') || lastInboundText.includes('কিভাবে');
  const topicMatch = lastInboundText.match(/(door|দরজা|cnc|artcam|aspire|toolpath|price|খরচ|দাম|website|react)/i);

  const topic = topicMatch ? `Inquiry regarding ${topicMatch[0]}` : 'General Discussion';
  const unanswered = hasQuestion ? [lastInboundText] : [];

  return {
    contactId,
    currentTopic: topic,
    userIntent: hasQuestion ? 'Seeking information or quote from Muhammad Nayeem' : 'General message',
    unansweredQuestions: unanswered,
    recentCommitments: [],
    previousContextSummary: recentHistory.length > 0
      ? `Contact has exchanged ${recentHistory.length} message(s) regarding CNC and design consultations.`
      : 'Initial contact conversation.',
    suggestedDraftReply: lastInboundText.includes('আসসালামু') || lastInboundText.match(/[\u0980-\u09FF]/)
      ? 'ওয়ালাইকুম আসসালাম। আপনার বার্তাটির জন্য ধন্যবাদ। আপনার কাজের প্রয়োজনীয় বিবরণ (সাইজ, ডিজাইন ফাইল বা কাঠের ধরণ) শেয়ার করলে দ্রুত সাহায্য করতে পারব।'
      : 'Hello! Thank you for your message. Muhammad Nayeem is available to assist with your CNC programming and design requirements. Please share your project details.',
    isCompleteHistoryAvailable: true,
    generatedAt: new Date().toISOString(),
  };
}

