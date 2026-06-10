const generateBtn = document.getElementById("generateBtn");
const copyBtn = document.getElementById("copyBtn");
const statusDiv = document.getElementById("status");
const preview = document.getElementById("preview");

let latestPrompt = "";

generateBtn.addEventListener("click", async () => {
    setStatus("Scraping job posting...", "neutral");
    setBusy(true);

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

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
            func: scrapeJobData
        });

        const data = injectionResult?.result;

        if (!data) {
            setStatus("No job data was returned from the page.", "error");
            return;
        }

        if (!data.description || data.description.length < 80) {
            setStatus("Could not extract enough job details from this page.", "error");
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
        setStatus("Could not copy to clipboard. Select the preview text manually.", "error");
    }
});

function buildPrompt(data) {
    const contactLine = data.contactName ? `\nContact person: ${data.contactName}` : "";
    const locationLine = data.location ? `\nLocation: ${data.location}` : "";
    const deadlineLine = data.deadline ? `\nApplication deadline: ${data.deadline}` : "";
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
*   **Red Flags:** [Missing skills, mismatched seniority, or potential concerns]

### Interview Prep Focus
*   **Technical Concepts to Review:** [1-2 specific system design principles, frameworks, or architectural concepts I should study to defend my Red Flags or ace their technical screen]
*   **Narrative Strategy:** [How I should frame my existing experience during an interview to bridge any gaps]

---

### Cover Letter
[Generate the tailored cover letter here]

# COVER LETTER REQUIREMENTS
Write the final cover letter only. Do not include any commentary, analysis, or notes unless explicitly asked for.

Use ONLY:
1. My background information already available in this chat thread.
2. The job posting above.

**Prioritize the most recent and professionally relevant experience first. Academic projects should support, not overshadow, professional experience when applicable.**
**Prioritize experiences and technologies that most directly match the posting's responsibilities and technical stack.**
**Prefer specificity over breadth. It is better to deeply connect 2-3 highly relevant experiences than briefly mention many unrelated technologies or projects.**
**Avoid repetitive transition phrases and overused co-op application language.**
**Avoid paraphrasing large portions of the posting back to the employer.**

Do not invent experience, technologies, projects, metrics, courses, awards, dates, immigration/work status, or personal details.

Before writing, silently identify:
- The employer's main needs.
- The 2 to 3 strongest overlaps between my background and the posting.
- Any keywords from the posting that should be naturally reflected.

Style:
    Big 3:
    1. **Tone:** Professional, confident, and direct. Avoid overly enthusiastic fluff, corporate jargon, and robotic phrasing.
    2. **Formatting:** Use 3 paragraphs. 200-300 words in total. Do NOT invent any skills.
        a. **The Hook (Paragraph 1 - About Them):** Do NOT use standard openings like "I am writing to apply for..." or "As a developer...". 
            Instead, open with a unique, humanized narrative. Identify a core technical challenge, product mission, or scale issue from the job description. 
            Start the letter by stating a genuine professional interest or observation about that specific problem space. 
            It should read like one engineer talking to another about a shared technical interest.
        b. **The Evidence (Paragraph 2 - About Me):** Transition naturally into how my background solves their specific problems. 
        c. **The Close (Paragraph 3 - The Fit):** Keep it under 3 sentences. Reinforce mutual fit and future contribution rather than simply restating interest. End with a concise, professional closing proposing a technical interview.
    3. **Call to Action:** The final paragraph should reinforce mutual fit and future contribution rather than simply restating interest.

- Specific to the posting.
- No bullet points.
- No placeholders.

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
        const labels = Array.isArray(labelCandidates) ? labelCandidates : [labelCandidates];

        const normalizedLabels = labels.map((label) =>
            cleanText(label).replace(/:$/, "").toLowerCase()
        );

        const cells = Array.from(document.querySelectorAll("td, th, strong, b, span, div"));

        for (const cell of cells) {
            const cellText = cleanText(cell.innerText || cell.textContent || "");
            const normalizedCellText = cellText.replace(/:$/, "").toLowerCase();

            const matches = normalizedLabels.some((label) =>
                normalizedCellText === label || normalizedCellText.includes(label)
            );

            if (!matches) continue;

            const tableCell = cell.closest("td, th");

            if (tableCell?.nextElementSibling) {
                const siblingText = cleanText(
                    tableCell.nextElementSibling.innerText ||
                    tableCell.nextElementSibling.textContent ||
                    ""
                );

                if (siblingText && !normalizedLabels.includes(siblingText.toLowerCase())) {
                    return siblingText;
                }
            }

            const row = cell.closest("tr");
            if (row) {
                const rowCells = Array.from(row.querySelectorAll("td, th"));
                const index = rowCells.findIndex((rowCell) => rowCell === tableCell);

                if (index >= 0 && rowCells[index + 1]) {
                    const rowValue = cleanText(rowCells[index + 1].innerText || rowCells[index + 1].textContent || "");
                    if (rowValue) return rowValue;
                }

                if (rowCells.length >= 2) {
                    const lastCellText = cleanText(rowCells[rowCells.length - 1].innerText || rowCells[rowCells.length - 1].textContent || "");
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
            truncated.lastIndexOf(", ")
        );

        const safeCut = lastBoundary > maxChars * 0.7
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

    const title = normalizeTitle(firstText([
        "h1.dashboard-header__profile-information-name",
        "h1",
        "[data-testid='job-title']"
    ]));

    const company = firstText([
        "h2.dashboard-header__profile-information-subtitle",
        "h2",
        "[data-testid='company-name']"
    ]);

    const description = getTableValue([
        "Job Description:",
        "Job Description",
        "Description:",
        "Description",
        "Position Description:",
        "Position Description"
    ]);

    const requirements = getTableValue([
        "Qualifications:",
        "Qualifications",
        "Required Skills:",
        "Required Skills",
        "Requirements:",
        "Requirements",
        "Skills:",
        "Skills"
    ]);

    const location = getTableValue([
        "Job Location:",
        "Job Location",
        "Location:",
        "Location",
        "Work Location:",
        "Work Location"
    ]);

    const deadline = getTableValue([
        "Application Deadline:",
        "Application Deadline",
        "Deadline:",
        "Deadline",
        "Apply By:",
        "Apply By",
        "Closing Date:",
        "Closing Date"
    ]);

    const firstName = getTableValue([
        "Job Contact First Name:",
        "Job Contact First Name",
        "Contact First Name:",
        "Contact First Name"
    ]);

    const lastName = getTableValue([
        "Job Contact Last Name:",
        "Job Contact Last Name",
        "Contact Last Name:",
        "Contact Last Name"
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
        rawPageTitle: cleanText(document.title)
    };
}