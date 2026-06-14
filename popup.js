const generateBtn = document.getElementById("generateBtn");
const copyBtn = document.getElementById("copyBtn");
const statusDiv = document.getElementById("status");
const preview = document.getElementById("preview");

let latestPrompt = "";

generateBtn.addEventListener("click", async () => {
  setStatus("Scraping job posting...", "neutral");
  setBusy(true);

  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (!tab?.id || !tab?.url) {
      setStatus("Could not read the active tab.", "error");
      return;
    }

    const url = new URL(tab.url);

    if (!url.hostname.endsWith("sfu.ca")) {
      setStatus("Open an SFU MyExperience posting first.", "error");
      return;
    }

    const [injectionResult] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: scrapeJobData,
    });

    const data = injectionResult?.result;

    if (!data) {
      setStatus("No job data was returned from the page.", "error");
      return;
    }

    if (!data.description || data.description.length < 80) {
      setStatus(
        "Could not extract enough job details from this page.",
        "error",
      );
      preview.value = JSON.stringify(data, null, 2);
      return;
    }

    latestPrompt = buildPrompt(data);
    preview.value = latestPrompt;
    copyBtn.disabled = false;

    await copyPromptToClipboard(latestPrompt);
    setStatus("Prompt generated and copied.", "success");
  } catch (error) {
    console.error("Prompt generation failed:", error);
    setStatus(readableError(error), "error");
  } finally {
    setBusy(false);
  }
});

copyBtn.addEventListener("click", async () => {
  const promptToCopy = preview.value.trim() || latestPrompt;

  if (!promptToCopy) {
    setStatus("Generate a prompt first.", "error");
    return;
  }

  try {
    await copyPromptToClipboard(promptToCopy);
    latestPrompt = promptToCopy;
    setStatus("Copied to clipboard.", "success");
  } catch (error) {
    console.error("Clipboard copy failed:", error);
    setStatus(
      "Could not copy to clipboard. Select the preview text manually.",
      "error",
    );
  }
});

function buildPrompt(data) {
  const contactLine = data.contactName
    ? `\nContact person: ${data.contactName}`
    : "";
  const locationLine = data.location ? `\nLocation: ${data.location}` : "";
  const deadlineLine = data.deadline
    ? `\nApplication deadline: ${data.deadline}`
    : "";
  const requirementsBlock = data.requirements
    ? `\n\n# ADDITIONAL REQUIREMENTS / QUALIFICATIONS\n---\n${data.requirements}\n---`
    : "";

  return `
# TASK
You are a strict, senior technical recruiter and executive copywriter. 
First, evaluate my fit for the role below based on my resume and the context already provided in this chat.
Second, provide a targeted interview prep guide based on their specific requirements.
Third, write a highly tailored co-op cover letter, regardless of the match score.

# TARGET ROLE
Position: ${fallback(data.title, "[Job Title]")}
Company: ${fallback(data.company, "[Company]")}${locationLine}${deadlineLine}${contactLine}

# JOB POSTING
---
${fallback(data.description, "[Job description was not extracted.]")}
---${requirementsBlock}

# OUTPUT FORMAT
You must structure your response exactly like this:

### Pre-Flight Fit Assessment
*   **Match Score:** [0-100%]
*   **Green Flags:** [1-2 strong overlaps between their stack/needs and my background]
*   **Beige Flags:** [1-2 areas where I have some relevant experience but it's not a direct match; this is the "gray area" where interview performance and narrative framing will be crucial]
*   **Red Flags:** [Missing skills, mismatched seniority, or potential concerns]

### Interview Prep Focus
*   **Technical Concepts to Review:** [1-3 specific system design principles, frameworks, or architectural concepts I should study to defend my Red Flags or ace their technical screen]
*   **Narrative Strategy:** [How I should frame my existing experience during an interview to bridge any gaps]

---

### Cover Letter
[Generate the tailored cover letter here]

# COVER LETTER REQUIREMENTS
Write the final cover letter only. Do not include any commentary, analysis, or notes unless explicitly asked for.

## Instructions
Use ONLY:
1. My background information already available in this chat thread.
2. The job posting above.

**The Rule of Ruthless Omission:** Strictly exclude any technologies, projects, or experiences from my background that do not directly map to the job's core requirements. 
For example, if the role is backend and testing focused, there is no need to mention frontend frameworks/experience. If the role is frontend-focused, there is no need to mention database migrations.
Instead of listing technologies, transform my relevant achievements into a brief narrative about my engineering mindset, how I approach debugging complex systems, or my experience navigating technical migrations and deployments.
**Prioritize the most recent and professionally relevant experience first. Academic projects should support, not overshadow, professional experience when applicable.**
**Prioritize experiences and technologies that most directly match the posting's responsibilities and technical stack.**
**Avoid repetitive transition phrases and overused co-op application language.**
**Avoid paraphrasing large portions of the posting back to the employer.**

Before writing, silently identify:
- The employer's main needs.
- The 2 to 3 strongest overlaps between my background and the posting.
- Any keywords from the posting that should be naturally reflected.

##
Style:
    Big 3:
    1. **Tone:** Professional, confident, and direct. Avoid overly enthusiastic fluff, corporate jargon, and robotic phrasing.
    2. **Formatting:** Use 3 paragraphs. 200-300 words in total. Do NOT invent any skills.

        a. **The Hook (Paragraph 1 - About Them):** Do NOT use standard openings like "I am writing to apply for..." or "As a developer...". 
            Instead, open with a unique, humanized narrative. Identify a core technical challenge, product mission, or scale issue from the job description. 
            Start the letter by stating a genuine professional interest or observation about that specific problem space. 
            It should read like one engineer talking to another about a shared technical interest.

        b. **The Evidence (Paragraph 2 - About Me):** Transition naturally into how my background solves their specific problems. 
            In this paragraph, do not simply list resume bullets or stack items. Use the most relevant technologies as proof points, but frame them through how I approached the work.
            For example, tracing issues, validating assumptions, refining changes through code review, supporting migrations, and considering downstream system impact. 
            Instead of saying "I have experience with X, Y, Z," say "In my work on [project], I navigated [challenge] by leveraging [technology/approach], which resulted in [impact]."
            The paragraph should feel like an engineering narrative, not a condensed resume.

        c. **The Close (Paragraph 3 - The Fit & Call to Action):** Keep the custom part of this paragraph to 1-2 sentences, reinforcing mutual fit and proposing a technical interview. You MUST always end the paragraph with exactly this text, word-for-word: 
        "Please feel free to contact me directly via my email, or reach out to SFU's co-op office to connect with my coordinator. Thank you for your time and consideration."

- Specific to the posting.
- No bullet points.
- No placeholders.

### Strict Constraints ("The Avoid List")
- Do NOT sound like a condensed resume summary.
- Do NOT overexplain every technology.
- Do NOT mention unrelated frontend, AI, or academic projects unless they can map to the posting.
- Do NOT invent experience, technologies, projects, metrics, courses, awards, dates, immigration/work status, or personal details.

`.trim();
}

async function copyPromptToClipboard(text) {
  await navigator.clipboard.writeText(text);
}

function setStatus(message, type) {
  statusDiv.innerText = message;

  if (type === "success") {
    statusDiv.style.color = "#147a2e";
  } else if (type === "error") {
    statusDiv.style.color = "#b00020";
  } else {
    statusDiv.style.color = "#555";
  }
}

function setBusy(isBusy) {
  generateBtn.disabled = isBusy;
  generateBtn.innerText = isBusy ? "Generating..." : "Generate";
}

function fallback(value, fallbackValue) {
  const cleaned = typeof value === "string" ? value.trim() : "";
  return cleaned || fallbackValue;
}

function readableError(error) {
  const message = error?.message || String(error);

  if (message.includes("Cannot access contents of url")) {
    return "Chrome blocked access to this page. Reload the posting and try again.";
  }

  if (message.includes("The extensions gallery cannot be scripted")) {
    return "Chrome does not allow scripting this page.";
  }

  return "An error occurred while generating the prompt.";
}

/**
 * Runs in the active SFU MyExperience page.
 */
function scrapeJobData() {
  function cleanText(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function firstText(selectors) {
    for (const selector of selectors) {
      const node = document.querySelector(selector);
      const text = cleanText(node?.innerText || node?.textContent || "");
      if (text) return text;
    }

    return "";
  }

  function getTableValue(labelCandidates) {
    const labels = Array.isArray(labelCandidates)
      ? labelCandidates
      : [labelCandidates];

    const normalizedLabels = labels.map((label) =>
      cleanText(label).replace(/:$/, "").toLowerCase(),
    );

    const cells = Array.from(
      document.querySelectorAll("td, th, strong, b, span, div"),
    );

    for (const cell of cells) {
      const cellText = cleanText(cell.innerText || cell.textContent || "");
      const normalizedCellText = cellText.replace(/:$/, "").toLowerCase();

      const matches = normalizedLabels.some(
        (label) =>
          normalizedCellText === label || normalizedCellText.includes(label),
      );

      if (!matches) continue;

      const tableCell = cell.closest("td, th");

      if (tableCell?.nextElementSibling) {
        const siblingText = cleanText(
          tableCell.nextElementSibling.innerText ||
            tableCell.nextElementSibling.textContent ||
            "",
        );

        if (
          siblingText &&
          !normalizedLabels.includes(siblingText.toLowerCase())
        ) {
          return siblingText;
        }
      }

      const row = cell.closest("tr");
      if (row) {
        const rowCells = Array.from(row.querySelectorAll("td, th"));
        const index = rowCells.findIndex((rowCell) => rowCell === tableCell);

        if (index >= 0 && rowCells[index + 1]) {
          const rowValue = cleanText(
            rowCells[index + 1].innerText ||
              rowCells[index + 1].textContent ||
              "",
          );
          if (rowValue) return rowValue;
        }

        if (rowCells.length >= 2) {
          const lastCellText = cleanText(
            rowCells[rowCells.length - 1].innerText ||
              rowCells[rowCells.length - 1].textContent ||
              "",
          );
          if (lastCellText && lastCellText !== cellText) return lastCellText;
        }
      }
    }

    return "";
  }

  function limitText(text, maxChars) {
    const cleaned = cleanText(text);

    if (cleaned.length <= maxChars) {
      return cleaned;
    }

    const truncated = cleaned.slice(0, maxChars);
    const lastBoundary = Math.max(
      truncated.lastIndexOf("\n\n"),
      truncated.lastIndexOf(". "),
      truncated.lastIndexOf("; "),
      truncated.lastIndexOf(", "),
    );

    const safeCut =
      lastBoundary > maxChars * 0.7
        ? truncated.slice(0, lastBoundary + 1)
        : truncated;

    return `${safeCut.trim()}\n\n[Truncated because the posting was very long.]`;
  }

  function normalizeTitle(rawTitle) {
    return cleanText(rawTitle)
      .replace(/^\d+\s*-\s*/, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  const title = normalizeTitle(
    firstText([
      "h1.dashboard-header__profile-information-name",
      "h1",
      "[data-testid='job-title']",
    ]),
  );

  const company = firstText([
    "h2.dashboard-header__profile-information-subtitle",
    "h2",
    "[data-testid='company-name']",
  ]);

  const description = getTableValue([
    "Job Description:",
    "Job Description",
    "Description:",
    "Description",
    "Position Description:",
    "Position Description",
  ]);

  const requirements = getTableValue([
    "Qualifications:",
    "Qualifications",
    "Required Skills:",
    "Required Skills",
    "Requirements:",
    "Requirements",
    "Skills:",
    "Skills",
  ]);

  const location = getTableValue([
    "Job Location:",
    "Job Location",
    "Location:",
    "Location",
    "Work Location:",
    "Work Location",
  ]);

  const deadline = getTableValue([
    "Application Deadline:",
    "Application Deadline",
    "Deadline:",
    "Deadline",
    "Apply By:",
    "Apply By",
    "Closing Date:",
    "Closing Date",
  ]);

  const firstName = getTableValue([
    "Job Contact First Name:",
    "Job Contact First Name",
    "Contact First Name:",
    "Contact First Name",
  ]);

  const lastName = getTableValue([
    "Job Contact Last Name:",
    "Job Contact Last Name",
    "Contact Last Name:",
    "Contact Last Name",
  ]);

  const contactName = cleanText(`${firstName} ${lastName}`);

  return {
    title: title || "[Job Title]",
    company: company || "[Company]",
    location,
    deadline,
    contactName,
    description: limitText(description, 7000),
    requirements: limitText(requirements, 2500),
    rawPageTitle: cleanText(document.title),
  };
}
