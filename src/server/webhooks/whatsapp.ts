import { Request, Response } from 'express';
import crypto from 'node:crypto';
import {
  verifyMetaSignature,
  parseWhatsAppWebhookBody,
  sendWhatsAppMessage,
  isWithinWhatsApp24HourWindow,
} from '../../services/whatsapp.ts';
import { appStore } from '../../db/store.ts';
import { classifyInboundMessage, generateGroundedResponse, detectLanguage } from '../../services/gemini.ts';
import { evaluateReplyPolicy } from '../../services/replyPolicy.ts';
import { sendTelegramMessage, formatWhatsAppInboundAlert } from '../../services/telegram.ts';
import { getPostgresPool } from '../../db/postgres.ts';
import { ClassificationResult } from '../../types/index.ts';

export interface FastFAQMatchResult {
  text: string;
  category: 'general' | 'technical' | 'pricing';
  key: string;
}

/**
 * Fast Rule/Keyword FAQ matcher for ultra-fast instant answers (< 50ms)
 * Directly checks Muhammad Nayeem's complete verified personal AI knowledge base & FAQ.
 * Categorizes FAQs into: 'general', 'technical', and 'pricing'.
 */
export function fastFAQMatch(
  text: string,
  lang: 'bn' | 'banglish' | 'en',
  senderName?: string
): FastFAQMatchResult | null {
  const norm = text.toLowerCase();
  const hasGreeting = Boolean(norm.match(/(hi|hello|hey|assalamu|salam|kemon|halo|হাই|হ্যালো|সালাম|আসসালামু)/i));
  const displayName = senderName ? senderName.split(' ')[0] : (lang === 'bn' ? 'বন্ধু' : 'friend');

  // ==========================================
  // 1. PRICING & RATES (Category: 'pricing')
  // ==========================================
  if (norm.match(/(price|cost|rate|dam|khoroch|koto|quotation|quote|fee|fees|চার্জ|দাম|খরচ|রেট|টাকা|বাজেট)/i)) {
    if (lang === 'bn') {
      const prefix = hasGreeting ? 'ওয়ালাইকুম আসসালাম! ' : '';
      return {
        text: `${prefix}সিএনসি ডিজাইন ও ৩ডি রিলিফ টুলপাথের খরচ মূলত ডিজাইনের সূক্ষ্মতা, সাইজ এবং জটিলতার ওপর নির্ভর করে। আপনার প্রয়োজনীয় কাজের সাইজ বা রেফারেন্স ছবি শেয়ার করলে নির্দিষ্ট কোটেশন দেওয়া সম্ভব।`,
        category: 'pricing',
        key: 'pricing_rates',
      };
    }
    const prefix = hasGreeting ? 'Walaikum Assalam! ' : '';
    return {
      text: `${prefix}Pricing for CNC toolpaths and 3D relief files depends on design complexity, dimensions, and depth of relief. Please share your project dimensions or sample images for a prompt custom quote.`,
      category: 'pricing',
      key: 'pricing_rates',
    };
  }

  // ==========================================
  // 2. TECHNICAL & SERVICES (Category: 'technical')
  // ==========================================

  // 2.1 CNC & CAD/CAM Software & 3D Door Toolpaths
  if (norm.match(/(door|darja|দরজা|টুলপাথ|toolpath|artcam|aspire|vcarve|fusion\s*360|autocad|dxf|cnc|relief|carving|wood|কাঠ|খোদাই)/i)) {
    if (lang === 'bn') {
      const prefix = hasGreeting ? 'ওয়ালাইকুম আসসালাম! ' : '';
      return {
        text: `${prefix}আমি AutoCAD, ArtCAM, Vectric Aspire, VCarve এবং Autodesk Fusion 360 ব্যবহার করে নিখুঁত 2D DXF ভেক্টর ব্লুপ্রিন্ট ও মিলিমিটার-অ্যাকুরেট ২ডি ও ৩ডি রিলিফ দরজার সিএনসি প্রোগ্রামিং ও ফাইল ১-২ কার্যদিবসে ডেলিভারি করি। আপনার দরজার মাপ ও পছন্দের ডিজাইন শেয়ার করলে এখনই শুরু করা যাবে।`,
        category: 'technical',
        key: 'technical_cnc_cadcam',
      };
    }
    const prefix = hasGreeting ? 'Walaikum Assalam! ' : '';
    return {
      text: `${prefix}I use AutoCAD, ArtCAM, Vectric Aspire, VCarve, and Autodesk Fusion 360 for precision 2D DXF vector blueprints, 3D relief wood carvings, and CNC machine programming with 1-2 business days turnaround. Feel free to share your door measurements and requirements.`,
      category: 'technical',
      key: 'technical_cnc_cadcam',
    };
  }

  // 2.2 Web & 3D Development
  if (norm.match(/(web|website|react|javascript|three\.?js|html|css|tailwind|frontend|backend|developer|development|প্রোগ্রামিং|ওয়েব|সাইট)/i)) {
    if (lang === 'bn') {
      return {
        text: 'আমার ওয়েব ডেভেলপমেন্ট স্কিলসেট: Frontend & 3D Web (HTML5, CSS3, JavaScript, React, Tailwind CSS, Three.js, GSAP, Framer Motion) এবং Backend, Database & Cloud (Python, Firebase Firestore, Google Apps Script, GitHub, Vercel, Netlify, Render)।',
        category: 'technical',
        key: 'technical_web_development',
      };
    }
    return {
      text: 'My web development stack includes Frontend & 3D Web (HTML5, CSS3, JavaScript, React, Tailwind CSS, Three.js, GSAP, Framer Motion) and Backend/Cloud (Python, Firebase Firestore, Google Apps Script, GitHub, Vercel, Netlify, Render).',
      category: 'technical',
      key: 'technical_web_development',
    };
  }

  // 2.3 Bot Automation & AI Prompting
  if (norm.match(/(bot|telegram\s*bot|telethon|mtproto|automation|prompt|midjourney|dall-?e|stable\s*diffusion|অটোমেশন|বট)/i)) {
    if (lang === 'bn') {
      return {
        text: 'অটোমেশন ও এআই স্কিলসেট: Python (Telethon, python-telegram-bot, MTProto API), Google Apps Script Webhooks; Midjourney ও DALL-E সিনেম্যাটিক প্রম্পট ইঞ্জিনিয়ারিং; এবং MS Office ডাটা ম্যানেজমেন্ট।',
        category: 'technical',
        key: 'technical_automation_ai',
      };
    }
    return {
      text: 'Automation & AI skills: Python (Telethon, python-telegram-bot, MTProto API), Google Apps Script Webhooks, Midjourney/DALL-E cinematic prompt engineering, and MS Office workflow management.',
      category: 'technical',
      key: 'technical_automation_ai',
    };
  }

  // 2.4 Notable Projects
  if (norm.match(/(project|projects|portfolio\s*project|portfolio|কাজ|প্রজেক্ট)/i)) {
    if (lang === 'bn') {
      return {
        text: 'আমার উল্লেখযোগ্য প্রজেক্টগুলো: ১. Interactive 3D Hardcover Book Portfolio (Three.js ও HTML5), ২. Telegram Channel Message Forwarding Automation Dashboard (Python ও MTProto API), ৩. 2D CAD/DXF Vector Blueprint Pipeline, ৪. মডার্ন ফুলস্ট্যাক রেসপনসিভ ওয়েব অ্যাপ।',
        category: 'technical',
        key: 'technical_projects',
      };
    }
    return {
      text: 'Notable projects: 1. Interactive 3D Hardcover Book Portfolio (Three.js & HTML5), 2. Telegram Channel Message Forwarding Automation Dashboard (Python & MTProto API), 3. 2D CAD/DXF Vector Blueprint Pipeline, 4. Modern responsive web applications.',
      category: 'technical',
      key: 'technical_projects',
    };
  }

  // 2.5 Portfolio Website & CV / Resume
  if (norm.match(/(cv|resume|website\s*link|portfolio\s*link|সিভি|রিজিউমে|পোর্টফোলিও)/i)) {
    if (lang === 'bn') {
      return {
        text: 'আমার অফিসিয়াল পোর্টফোলিও ওয়েবসাইট (muhammadnayeem.qzz.io) ভিজিট করলেই আমার সব প্রজেক্ট দেখতে পাবেন এবং সেখানে থাকা বাটন থেকে সরাসরি Google Drive-এ সংরক্ষিত আমার আপডেটেড CV ডাউনলোড করতে পারবেন।',
        category: 'technical',
        key: 'technical_website_cv',
      };
    }
    return {
      text: 'You can visit my official portfolio website (muhammadnayeem.qzz.io) to explore all my projects and download my updated CV directly from Google Drive.',
      category: 'technical',
      key: 'technical_website_cv',
    };
  }

  // ==========================================
  // 3. GENERAL & PROFILE (Category: 'general')
  // ==========================================

  // 3.1 Location / Office / Village / Address inquiry
  if (norm.match(/(kothay|location|office|thaken|address|thikana|bari|gram|dowaliya|হাজীগঞ্জ|চাঁদপুর|দোয়ালিয়া|কোথায়|লোকেশন|অফিস|ঠিকানা|বাড়ি|গ্রাম)/i)) {
    if (lang === 'bn') {
      const prefix = hasGreeting ? 'ওয়ালাইকুম আসসালাম! ' : '';
      return {
        text: `${prefix}মুহাম্মদ নাঈমের বাসা চট্টগ্রাম বিভাগের চাঁদপুর জেলার হাজীগঞ্জ উপজেলার দোয়ালিয়া গ্রামে। তিনি হাজীগঞ্জ বাজারের 'চিটাগাং ডোর'-এ সিনিয়র সিএনসি প্রোগ্রামার ও ডিজাইনার হিসেবে কর্মরত আছেন। স্থানীয় ও দূরবর্তী উভয় ক্লায়েন্টের জন্য অনলাইন সিএনসি ফাইল ও কনসালটেন্সি সেবা প্রদান করা হয়।`,
        category: 'general',
        key: 'general_address_location',
      };
    }
    const prefix = hasGreeting ? 'Walaikum Assalam! ' : '';
    return {
      text: `${prefix}Muhammad Nayeem lives in Dowaliya village, Hajiganj, Chandpur, Chattogram Division, Bangladesh. He works at Chittagong Door in Hajiganj as a Senior CNC Programmer & Designer, serving clients locally and globally.`,
      category: 'general',
      key: 'general_address_location',
    };
  }

  // 3.2 Personal Identity & Who is Nayeem
  if (norm.match(/(who is|parichoy|parichay|tumi ke|nayeem ke|about yourself|পরিচয়|কে তুমি|নাঈম কে)/i)) {
    if (lang === 'bn') {
      return {
        text: 'আমি Muhammad Nayeem (পুরো নাম: MD. Nayeem Uddin)। আমি একজন Senior Programmer of Computerized Numerical Control (CNC), Web Developer এবং Digital Creator। পাশাপাশি Computer Science Engineering (CSE) নিয়ে পড়াশোনা করছি।',
        category: 'general',
        key: 'general_personal_identity',
      };
    }
    return {
      text: 'I am Muhammad Nayeem (full name: MD. Nayeem Uddin). I work as a Senior Programmer of Computerized Numerical Control (CNC), alongside being a Web Developer and Digital Creator while pursuing my B.Sc. in Computer Science Engineering (CSE).',
      category: 'general',
      key: 'general_personal_identity',
    };
  }

  // 3.3 Date of birth & Age
  if (norm.match(/(birthday|birth\s*date|age|boyosh|jonmo|জন্ম|বয়স)/i)) {
    if (lang === 'bn') {
      return {
        text: 'মুহাম্মদ নাঈমের জন্ম ৩০ সেপ্টেম্বর, ২০০৬ সালে।',
        category: 'general',
        key: 'general_date_of_birth',
      };
    }
    return {
      text: 'Muhammad Nayeem was born on September 30, 2006.',
      category: 'general',
      key: 'general_date_of_birth',
    };
  }

  // 3.4 Job & Profession
  if (norm.match(/(job|profession|pesha|chakri|ki koro|কাজ কি|পেশা|চাকরি|কি করো)/i)) {
    if (lang === 'bn') {
      return {
        text: 'আমি একজন Senior Programmer of Computerized Numerical Control (CNC) হিসেবে কর্মরত আছি, পাশাপাশি ওয়েব ডেভেলপমেন্ট ও ডিজিটাল ক্রিয়েশন করি।',
        category: 'general',
        key: 'general_job_profession',
      };
    }
    return {
      text: 'I work as a Senior Programmer of Computerized Numerical Control (CNC), alongside web development and digital creation.',
      category: 'general',
      key: 'general_job_profession',
    };
  }

  // 3.5 Family Background
  if (norm.match(/(family|baba|ma|paribar|brother|bhai|পরিবার|বাবা|মা|ভাই)/i)) {
    if (lang === 'bn') {
      return {
        text: 'মুহাম্মদ নাঈমের বাবার নাম খুজা আহমেদ (Khuza Ahmed) এবং মায়ের নাম ফারজানা বেগম (Farzana Begum)। পরিবারে একজন বড় ভাই এবং একজন ছোট ভাই আছে।',
        category: 'general',
        key: 'general_family_background',
      };
    }
    return {
      text: 'His father is Khuza Ahmed and mother is Farzana Begum. In his family, he has one elder brother and one younger brother.',
      category: 'general',
      key: 'general_family_background',
    };
  }

  // 3.6 Education Background
  if (norm.match(/(education|study|college|school|hsc|ssc|jsc|psc|bsc|cse|পড়াশোনা|শিক্ষাগত|কলেজ|স্কুল)/i)) {
    if (lang === 'bn') {
      return {
        text: 'শিক্ষাগত যোগ্যতা: ১. B.Sc. in Computer Science Engineering (CSE) — বর্তমানে অধ্যয়নরত। ২. HSC (২০২৪) — হাজীগঞ্জ মডেল সরকারি কলেজ। ৩. SSC (২০২২) ও JSC (২০২০) — হাজীগঞ্জ আমিন মেমোরিয়াল উচ্চ বিদ্যালয়। ৪. PSC (২০১৭) — দোয়ালিয়া সরকারি প্রাথমিক বিদ্যালয়।',
        category: 'general',
        key: 'general_education',
      };
    }
    return {
      text: 'Educational background: 1. B.Sc. in Computer Science Engineering (CSE) — Ongoing. 2. HSC (2024) — Hajiganj Model Govt College. 3. SSC (2022) & JSC (2020) — Hajiganj Amin Memorial High School. 4. PSC (2017) — Dowaliya Primary School.',
      category: 'general',
      key: 'general_education',
    };
  }

  // 3.7 Relationship Status (Normal ask: Single / Girlfriend)
  if (norm.match(/(girlfriend|single|gf|relationship|biye|বিয়ে|গার্লফ্রেন্ড|সিঙ্গেল|রিলেশন)/i) && !norm.match(/(prem\s*korba|date\s*me|like\s*me|প্রেম\s*করবা)/i)) {
    if (lang === 'bn') {
      return {
        text: 'না, কোনো গার্লফ্রেন্ড নেই। বর্তমানে একদম সিঙ্গেল। নিজের ক্যারিয়ার, কোডিং আর প্রজেক্ট নিয়েই ব্যস্ত সময় কাটে।',
        category: 'general',
        key: 'general_relationship_status',
      };
    }
    return {
      text: 'No girlfriend. Completely single right now—mostly focused on career, coding, and building new projects.',
      category: 'general',
      key: 'general_relationship_status',
    };
  }

  // 3.8 Flirt & Sigma Response Rule (If female / romantic interest shows up)
  if (norm.match(/(prem\s*korba|date\s*me|like\s*me|boyfriend\s*hoba|tumi\s*ki\s*amake\s*bhalobasho|প্রেম\s*করবা|আমাকে\s*কেমন\s*লাগে)/i)) {
    if (lang === 'bn') {
      return {
        text: `নিজে থেকে প্রেম করার কোনো প্ল্যান বা তাড়াহুড়ো নেই। তবে কোনো মেয়ে যদি সত্যিই স্পেশাল হয় আর আমাদের ভাইব মিলে যায়, তখন ভেবে দেখা যেতে পারে। তোমাকে দেখে অবশ্য বেশ ইন্টারেস্টিং মনে হচ্ছে, ${displayName}!`,
        category: 'general',
        key: 'general_flirt_sigma',
      };
    }
    return {
      text: `I don't really chase relationships or rush into things. But if a girl is genuinely special and the vibe matches, I might consider it. You do seem pretty interesting though, ${displayName}!`,
      category: 'general',
      key: 'general_flirt_sigma',
    };
  }

  // 3.9 Standalone Greetings
  if (hasGreeting) {
    if (lang === 'bn') {
      return {
        text: 'ওয়ালাইকুম আসসালাম! মুহাম্মদ নাঈমের এআই ডেস্কে আপনাকে স্বাগতম। চিটাগাং ডোরের সিএনসি উড কার্ভিং, ২ডি/৩ডি রিলিফ টুলপাথ বা ওয়েবসাইট ডেভেলপমেন্ট সংক্রান্ত যেকোনো তথ্য জানতে মেসেজ করতে পারেন। কিভাবে সাহায্য করতে পারি?',
        category: 'general',
        key: 'general_greeting',
      };
    }
    if (lang === 'banglish') {
      return {
        text: 'Walaikum Assalam! Muhammad Nayeem er AI Desk e apnake shagotom. CNC wood carving, 2D/3D toolpath ba web development niye kivabe shajjo korte pari?',
        category: 'general',
        key: 'general_greeting',
      };
    }
    return {
      text: 'Hello and welcome to Muhammad Nayeem\'s AI Desk! How can I assist you today with CNC design, 3D wood relief toolpaths, or CAD/CAM workflows?',
      category: 'general',
      key: 'general_greeting',
    };
  }

  return null;
}

/**
 * POST handler for /api/webhooks/whatsapp
 * Strictly adheres to Meta Graph API webhook specification:
 * 1. Validates HMAC signature via verifyMetaSignature
 * 2. Immediately responds with 200 OK to acknowledge receipt and prevent retries
 * 3. Ingests and saves incoming messages and delivery statuses into PostgreSQL/Supabase
 * 4. Checks verified FAQ knowledge base and responds immediately
 */
export async function postWhatsAppWebhook(req: Request, res: Response): Promise<void> {
  const signature = req.headers['x-hub-signature-256'] as string | undefined;
  const rawBody = (req as any).rawBody || JSON.stringify(req.body);

  // 1. Verify HMAC SHA-256 signature
  if (process.env.META_APP_SECRET && !verifyMetaSignature(rawBody, signature)) {
    console.warn('[WhatsApp Webhook Security]: Signature verification failed');
    res.status(401).json({ error: 'Invalid Meta X-Hub-Signature-256 HMAC' });
    return;
  }

  // 2. Always return a 200 status code to Meta to acknowledge receipt immediately
  res.status(200).send('EVENT_RECEIVED');

  // 3. Process payload asynchronously
  try {
    const parsed = parseWhatsAppWebhookBody(req.body);

    // Update message delivery statuses (sent, delivered, read, failed)
    for (const st of parsed.statuses) {
      await appStore.updateMessageDeliveryStatus(st.messageId, st.status, st.error);
    }

    // Process incoming WhatsApp messages
    for (const msg of parsed.messages) {
      // Idempotency check: prevent duplicate processing on retried webhooks
      const isDuplicate = await appStore.isWebhookEventProcessed(msg.messageId);
      if (isDuplicate) {
        continue;
      }

      // Record webhook event hash for idempotency
      const pHash = crypto.createHash('sha256').update(msg.text).digest('hex');
      await appStore.recordWebhookEvent(msg.messageId, 'whatsapp', 'messages.upsert', pHash);

      // Upsert contact record in database
      const contact = await appStore.upsertContact({
        phoneNumber: msg.fromPhone,
        name: msg.senderName,
        channel: 'whatsapp',
      });

      // 1. Retrieve conversation history first before reply generation
      const history = await appStore.getMessages(contact.id);
      const detectedLang = detectLanguage(msg.text);

      const recentMessages = history.slice(-6);
      const hasPriorConversation = recentMessages.length > 0;
      const lastMessage = hasPriorConversation ? recentMessages[recentMessages.length - 1] : null;
      const lastMsgTime = lastMessage ? new Date(lastMessage.createdAt).getTime() : 0;
      const isOngoingConversation = hasPriorConversation && (Date.now() - lastMsgTime < 2 * 60 * 60 * 1000);

      // Only match fast FAQ if this is a fresh conversation opening inquiry
      let fastMatched = null;
      if (!isOngoingConversation) {
        fastMatched = fastFAQMatch(msg.text, detectedLang, contact.name);
      }

      let classification: ClassificationResult;
      let replyText: string | null = null;

      if (fastMatched) {
        classification = {
          category: 'faq_business',
          confidence: 0.98,
          detectedLanguage: detectedLang,
          reasoning: `Directly matched Muhammad Nayeem verified FAQ [${fastMatched.category}]: ${fastMatched.key}`,
          isHighImpact: false,
          isInjectionAttempt: false,
        };
        replyText = fastMatched.text;
      } else {
        classification = await classifyInboundMessage(msg.text);
      }

      // Insert incoming record into 'messages' table
      const inboundMsg = await appStore.addMessage({
        contactId: contact.id,
        direction: 'inbound',
        content: msg.text,
        status: 'received',
        deliveryStatus: 'delivered',
        source: 'system',
        category: classification.category,
        confidenceScore: classification.confidence,
        detectedLanguage: classification.detectedLanguage,
        whatsappMessageId: msg.messageId,
        rawPayload: msg.rawPayload,
      });

      // Evaluate reply safety policy
      const settings = await appStore.getSettings();
      const isWithin24h = isWithinWhatsApp24HourWindow(contact.lastInboundAt);
      const policy = evaluateReplyPolicy(classification, settings, {
        isWithin24hWindow: isWithin24h,
        contactMode: contact.mode || 'auto_reply',
        isLocked: contact.isLocked,
      });

      // If contact is in human takeover mode or locked, do not auto-reply
      if (contact.mode === 'human_takeover' || contact.isLocked) {
        if (settings.telegramAlertsEnabled) {
          const alert = formatWhatsAppInboundAlert({
            contact,
            messageText: msg.text,
            category: classification.category,
            statusBadge: 'AI Paused (Human Takeover)',
            summary: 'Human Takeover active. AI will not reply automatically.',
          });
          await sendTelegramMessage(alert.text, { replyMarkup: alert.replyMarkup });
        }
        continue;
      }

      // If replyText not yet set from fast FAQ, generate with Gemini
      if (!replyText) {
        const kb = await appStore.getKnowledgeBase();
        const memories = await appStore.getMemories(contact.id);

        replyText = await generateGroundedResponse({
          inboundText: msg.text,
          category: classification.category,
          detectedLanguage: classification.detectedLanguage,
          knowledgeBase: kb,
          recentHistory: history,
          memories,
          systemPrompt: settings.systemPrompt,
          senderName: contact.name,
        });
      }

      if (policy.shouldAutoSend && replyText) {
        // Dispatch instant reply via Meta WhatsApp Cloud API
        const sendResult = await sendWhatsAppMessage(contact.phoneNumber, replyText);

        // Store outgoing message in PostgreSQL/Supabase database
        await appStore.addMessage({
          contactId: contact.id,
          direction: 'outbound',
          content: replyText,
          status: sendResult.success ? 'sent' : 'failed',
          deliveryStatus: sendResult.success ? 'sent' : 'failed',
          source: 'ai_auto_reply',
          category: classification.category,
          confidenceScore: classification.confidence,
          whatsappMessageId: sendResult.messageId,
          failureReason: sendResult.error,
        });

        // Notify Muhammad Nayeem via Telegram bot
        if (settings.telegramAlertsEnabled) {
          const alert = formatWhatsAppInboundAlert({
            contact,
            messageText: msg.text,
            category: classification.category,
            statusBadge: 'AI Auto-Replied (FAQ)',
            summary: `Replied with: "${replyText.slice(0, 100)}..."`,
          });
          await sendTelegramMessage(alert.text, { replyMarkup: alert.replyMarkup });
        }
      } else {
        // Create pending approval reply for sensitive / romantic / uncertain queries
        const pending = await appStore.addPendingReply({
          messageId: inboundMsg.id,
          contactId: contact.id,
          contactName: contact.name,
          contactPhone: contact.phoneNumber,
          inboundText: msg.text,
          proposedText: replyText || 'Message received; held for personal review.',
          category: classification.category,
          confidenceScore: classification.confidence,
          decisionReason: policy.reason,
        });

        await appStore.updateMessageStatus(inboundMsg.id, 'pending_approval');

        if (settings.telegramAlertsEnabled) {
          const alert = formatWhatsAppInboundAlert({
            contact,
            messageText: msg.text,
            category: classification.category,
            statusBadge: 'Pending Approval',
            summary: `Reason: ${policy.reason}`,
            pendingReplyId: pending.id,
          });
          await sendTelegramMessage(alert.text, { replyMarkup: alert.replyMarkup });
        }
      }
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('[WhatsApp Webhook Handler Error]:', errorMsg);
  }
}

export default postWhatsAppWebhook;
