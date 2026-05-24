# SFU Co-op Prompt Compiler

A lightweight, serverless Chrome Extension designed to automate the extraction of job data from the SFU myExperience (Orbis) portal and generate highly engineered, context-aware prompts for Large Language Models (LLMs).

## Key Features
* **Bypasses SSO:** Executes entirely on the client side, leveraging the user's active session.
* **Smart DOM Traversal:** Uses custom JavaScript logic to navigate messy, deeply nested Orbis HTML tables to reliably extract the Job Title, Company, Description, and Hiring Manager Contact.
* **Data Sanitization:** Automatically strips internal system IDs from job titles using regex and normalizes whitespace to optimize LLM token limits.
* **Zero-State Architecture:** Requires no database, no backend routing, and no hardcoded API keys. It serves purely as an instantaneous clipboard utility.
* **Context Anchoring:** The prompt template is engineered with strict negative constraints (e.g., forbidding AI jargon) and hardcoded career anchors (e.g., explicitly instructing the AI to map the job requirements to past experience with AWS infrastructure and system migrations).

## Tech Stack
* **Frontend:** HTML5, CSS3
* **Logic:** Vanilla JavaScript (ES6+)
* **Architecture:** Chrome Extension API (Manifest V3), Serverless

## Installation (Chrome Extension Developer Mode)
Since this is a specialized, personal-use utility, it is run locally via Chrome's Developer Mode:
1. Clone this repository to your local machine.
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Toggle **Developer mode** ON in the top right corner.
4. Click **Load unpacked** and select the cloned project directory.
5. Pin the extension to your Chrome toolbar.

## Usage
1. Navigate to a specific job posting on the SFU myExperience portal.
2. Click the extension icon. 
3. The extension instantly parses the DOM, compiles the prompt, and loads it to your clipboard.
4. Paste into your preferred LLM chat interface where your base resume context is already established.
