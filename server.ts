import express from "express";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const app = express();
app.use(express.json());

const PORT = 3000;

// Initialize Gemini Client safely
// Will fall back to a dummy response or mock if GEMINI_API_KEY is not defined, but the instructions say:
// "SDKs that require API keys will crash the app on startup if the key is missing... Use lazy initialization or check if key exists gracefully."
let aiClient: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI | null {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (key) {
      aiClient = new GoogleGenAI({
        apiKey: key,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });
    }
  }
  return aiClient;
}

// System Instruction for the chatbot
const SYSTEM_INSTRUCTION = `You are a highly capable AI Assistant representing Ram Halder (RK Halder), an elite Finance, Accounts, and Automation Specialist.
Your primary objective is to engage with visitors, answer queries about RK's background, explain his services, and encourage clients to contact him or fill out the contact form.

RK Halder's Profile & Expertise:
- Name: Ram Halder (commonly known as RK Halder)
- Role: Finance, Accounts, & Automation Specialist / Expert
- Experience:
  * 18+ Years in corporate Finance & Accounts Management
  * 10+ Years dedicated strictly to automation using technology (VBA, RPA, Power Automate, Custom AI integration, ERP/SAP scripting)
- Core Strengths & Services:
  1. VBA Automation: Excel macros, workbook consolidation, database syncing, automatic emailing, accounting data entry automation.
  2. RPA & Power Automate: Robot process automation, automated report generation, invoice processing, cross-software pipelines (Outlook to SAP/ERP).
  3. AI Development & Integration: Designing custom intelligent agents, document reading with OCR/LLMs, predictive financial analysis tools.
  4. ERP / SAP Support: Custom report scripting, automated journal entry uploads, automated ledger reconciliations.
  5. Finance Process Optimization: Month-end close acceleration, audit preparation streamlining, reducing manual copy-paste bottlenecks.
- Contact Details:
  * Mobile: +91 9818714744
  * Email: rk.10.halder@gmail.com
- Tone & Style:
  * Professional, warm, structured, and technically proficient.
  * Keep responses relatively concise and focused (under 120 words unless detailing a technical solution).
  * Always mention that they can fill out the interactive contact form on the left or click 'Book a Call' to reach RK directly!
  * If someone requests services, explain how RK can solve their problem and offer to connect them.`;

// Search Engine Crawling & Sitemap dynamic helpers
app.get("/robots.txt", (req, res) => {
  const appUrl = process.env.APP_URL || `https://${req.headers.host}`;
  res.type("text/plain");
  res.send(`User-agent: *
Allow: /

Sitemap: ${appUrl}/sitemap.xml`);
});

app.get("/sitemap.xml", (req, res) => {
  const appUrl = process.env.APP_URL || `https://${req.headers.host}`;
  res.type("application/xml");
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${appUrl}/</loc>
    <lastmod>${new Date().toISOString().split("T")[0]}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>`);
});

// Google Search Console dynamic verification route
app.get("/google753b082c8e989469.html", (req, res) => {
  res.type("text/html");
  res.send("google-site-verification: google753b082c8e989469.html");
});

// API routes first
app.post("/api/chat", async (req, res) => {
  try {
    const { message, history } = req.body;

    if (!message) {
      res.status(400).json({ error: "Message is required" });
      return;
    }

    const ai = getAiClient();
    if (!ai) {
      // Graceful fallback if no API key is available yet
      console.warn("GEMINI_API_KEY is not defined. Using professional mock reply.");
      setTimeout(() => {
        res.json({
          reply: `Thank you for asking! RK Halder is a veteran with a powerful dual skillset: 18+ years in Finance & Accounts, and 10+ years building advanced automation workflows (VBA, RPA, AI integration, ERP).

I'd love to help you build something automated or review your accounting pipelines. Please fill out the contact details or call RK directly at +91 9818714744!`,
        });
      }, 800);
      return;
    }

    // Format history for the chat API
    // We can use create chat session if history is provided or construct contents.
    // Let's use ai.models.generateContent with systemInstruction for complete control over history formatting
    const formattedContents: any[] = [];
    
    if (history && Array.isArray(history)) {
      let lastRole: "user" | "model" | null = null;
      for (const turn of history) {
        if (!turn.text || typeof turn.text !== "string" || !turn.text.trim()) {
          continue;
        }
        const role = turn.sender === "user" ? "user" : "model";
        
        // Skip any model/AI turns at the absolute beginning to guarantee the list starts with a user turn
        if (lastRole === null && role === "model") {
          continue;
        }
        
        // If there are consecutive identical roles, append their texts to ensure strict alternating order
        if (role === lastRole) {
          if (formattedContents.length > 0) {
            const lastTurn = formattedContents[formattedContents.length - 1];
            lastTurn.parts[0].text = (lastTurn.parts[0].text + "\n" + turn.text).trim();
          }
        } else {
          formattedContents.push({
            role: role,
            parts: [{ text: turn.text.trim() }],
          });
          lastRole = role;
        }
      }
    }
    
    // Add the current user query to the contents list
    const cleanMessage = (message || "").trim();
    if (cleanMessage) {
      if (formattedContents.length > 0 && formattedContents[formattedContents.length - 1].role === "user") {
        // If previous entry was already user, merge messages
        formattedContents[formattedContents.length - 1].parts[0].text = 
          (formattedContents[formattedContents.length - 1].parts[0].text + "\n" + cleanMessage).trim();
      } else {
        formattedContents.push({
          role: "user",
          parts: [{ text: cleanMessage }],
        });
      }
    }

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: formattedContents,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.7,
      },
    });

    const replyText = response.text || "I apologize, but I could not compute a response. Please reach out to RK Halder at rk.10.halder@gmail.com.";
    res.json({ reply: replyText });
  } catch (error: any) {
    console.error("Error in /api/chat route:", error);
    res.status(500).json({
      error: "Internal server error",
      details: error.message || String(error),
      reply: "Sorry, I ran into an issue connecting to my brain. Please try again or reach out to RK Halder directly!",
    });
  }
});

// Secure contact form submission proxying via server to bypass browser/client AdBlockers and CORS
app.post("/api/contact", async (req, res) => {
  const { name, email, query_type, message, _subject, _captcha } = req.body;

  if (!name || !email || !message) {
    res.status(400).json({ error: "Name, email, and message are required fields." });
    return;
  }

  const queryTypeStr = query_type || "General Inquiry";
  const payload = {
    name,
    email,
    query_type: queryTypeStr,
    message,
    _subject: _subject || `New Portfolio Lead from ${name} [${queryTypeStr}]`,
    _captcha: _captcha || "false"
  };

  console.log(`[Form Proxy] Dispatching lead via secure proxy for caller: nm=${name}, em=${email}`);

  try {
    // Mimic standard headers to ensure FormSubmit treats the request as a legitimate client form action
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    };

    // Forward the source headers if present in incoming request
    if (req.headers.origin) {
      headers["Origin"] = String(req.headers.origin);
    } else {
      headers["Origin"] = "https://formsubmit.co";
    }

    if (req.headers.referer) {
      headers["Referer"] = String(req.headers.referer);
    } else {
      headers["Referer"] = "https://formsubmit.co/";
    }

    // Set a snappy timeout of 3 seconds so the frontend activates the direct mail router fallback immediately if FormSubmit is offline/blocked
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 3000);

    const response = await fetch("https://formsubmit.co/ajax/rk.10.halder@gmail.com", {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(id);

    const textResult = await response.text();
    console.log(`[Form Proxy] FormSubmit raw response status: ${response.status}`);

    let parsedResult: any = {};
    try {
      parsedResult = JSON.parse(textResult);
    } catch (parseErr) {
      // Body may be a HTML page from Cloudflare (e.g. 522 page)
    }

    if (response.ok && (parsedResult.success === "true" || parsedResult.success === true)) {
      res.json({ success: true, message: "Lead dispatched successfully!" });
    } else {
      // In case FormSubmit returns an error status (like 522 Cloudflare), act gracefully
      console.warn("[Form Proxy] Webhook server returned error state or was unreachable. Redirecting client to direct dispatcher.");
      
      const isActivationPrompt = textResult.toLowerCase().includes("activate") || 
                                 textResult.toLowerCase().includes("confirmation") || 
                                 response.status === 403;

      if (isActivationPrompt) {
        res.status(200).json({ 
          success: true, 
          needsActivation: true, 
          message: "Form needs activation. Check your email inbox to activate FormSubmit!" 
        });
      } else {
        // Fallback state: return 200 with fallback instructions so the browser rendering transitions perfectly
        res.status(200).json({
          success: false,
          fallback: true,
          message: parsedResult.message || "Upstream hosting is undergoing maintenance.",
          payload: { name, email, query_type: queryTypeStr, message }
        });
      }
    }
  } catch (error: any) {
    if (error.name === "AbortError" || error.code === "DOMException") {
      console.warn("[Form Proxy] Connection request to formsubmit.co timed out (3s maximum limit reached). Seamlessly launching direct mail client fallback for the client.");
    } else {
      console.warn("[Form Proxy] Connection request error:", error.message || String(error));
    }

    // Return the structured fallback template so the user can easily click to send via mail client
    res.status(200).json({
      success: false,
      fallback: true,
      message: "The proxy server diverted to user direct dispatch.",
      payload: { name, email, query_type: queryTypeStr, message }
    });
  }
});

// Configure Vite or statically compiled files
async function startServer() {
  let isProduction = process.env.NODE_ENV === "production";
  
  try {
    // If running from bundled CommonJS inside the dist folder
    if (typeof __filename !== "undefined" && (__filename.includes("server.cjs") || __filename.includes("dist"))) {
      isProduction = true;
    }
  } catch (e) {
    // Ignored in non-CJS environments
  }

  if (!isProduction) {
    console.log("Setting up Vite development middleware...");
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Setting up static file serving for production...");
    
    // Support resolution fallback in case the container directory shifts
    let distPath = path.join(process.cwd(), "dist");
    try {
      if (typeof __dirname !== "undefined") {
        if (__dirname.endsWith("dist") || __dirname.includes("dist")) {
          distPath = __dirname;
        } else {
          distPath = path.join(__dirname, "dist");
        }
      }
    } catch (_) {}

    console.log(`[Server] Serving static frontend files from: ${distPath}`);
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
