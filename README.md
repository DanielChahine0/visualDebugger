<h1 align="center">🐞 Visual Debugger</h1>
<h3 align="center">AI-Powered Bug Tutor for VS Code</h3>
<p align="center">
  <a href="https://github.com/kurtjallo/visualDebugger">View Repo</a> •
  <a href="https://github.com/kurtjallo/visualDebugger/issues">Report Bug</a> 
</p>

<div align="center">

![Static Badge](https://img.shields.io/badge/Status-Hackathon_Submission-blue)
![Static Badge](https://img.shields.io/badge/Powered_By-Gemini_2.0_Flash-blue)

</div>

## 📖 About The Project

Visual Debugger is an AI-powered educational tool that transforms the debugging process into a learning opportunity. Instead of just fixing code blindly, it helps students and junior developers understand *why* an error occurred and *how* to verify the fix.

Debugging is often the most frustrating part of learning to code. Beginners get stuck on cryptic error messages, apply random fixes from StackOverflow, or let AI write code they don't understand. Visual Debugger bridges this gap by acting as an always-available tutor that explains the logic, visualizes the changes, and tracks learning progress over time.

Built for the **CTRL HACK DEL**, utilizing **Google Gemini 2.0 Flash** for high-speed, structured reasoning.

## ✨ Key Features

- **🧠 Plain English Explanations** – Translates cryptic runtime errors and syntax issues into clear, beginner-friendly language.
- **🗣️ Audio Guidance** – Uses **ElevenLabs** (Elise) to read explanations aloud, helping auditory learners.
- **📊 Visual Diff Reviews** – Shows exactly what changed with a clear red/green diff visualization and "Why this works" breakdown.
- **🎯 Interactive Quizzes** – Generates quick multiple-choice questions to ensure you actually understood the bug.
- **📈 Progress Dashboard** – Tracks your most common error categories over time using **Chart.js**.
- **🔎 Inline Actions** – "Explain This Error" CodeLens appears right next to red squiggles in your editor.

## 🛠️ Built With

### Core
![VS Code](https://img.shields.io/badge/VS%20Code-007ACC?style=for-the-badge&logo=visualstudiocode&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Esbuild](https://img.shields.io/badge/esbuild-FFCF00?style=for-the-badge&logo=esbuild&logoColor=black)

### AI & Services
![Google Gemini](https://img.shields.io/badge/Google%20Gemini-4285F4?style=for-the-badge&logo=google&logoColor=white)
![ElevenLabs](https://img.shields.io/badge/ElevenLabs-000000?style=for-the-badge&logo=elevenlabs&logoColor=white) 

### UI & Visualization
![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white)
![Chart.js](https://img.shields.io/badge/Chart.js-F5788D?style=for-the-badge&logo=chartdotjs&logoColor=white)

## 🚀 Getting Started

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/kurtjallo/visualDebugger.git
   cd visualDebugger
   ```

2. **Install dependencies**
   ```bash
   cd extension
   npm install
   ```

3. **Set up API Keys**
   
   You will need a Google Gemini API key.
   - Press `Ctrl+Shift+P` (Cmd+Shift+P on Mac)
   - Run command: `Visual Debugger: Set Gemini API Key`
   - Paste your key from [Google AI Studio](https://aistudio.google.com/)

   *(Optional)* For voice features:
   - Run command: `Visual Debugger: Set ElevenLabs API Key`

4. **Run the Extension**
   - Open `extension/src/extension.ts`
   - Press `F5` to open a new VS Code window with the extension loaded.

---

## 💡 Usage

1. **Open a file** with errors (or use our `demo-app` folder).
2. **Click "Explain This Error"** floating above the red squiggle.
3. **Read or Listen** to the explanation in the side panel.
4. **Apply Fix** to see the code changes.
5. **Review the Diff** to understand exactly what was modified and why.

## 👨‍💻 Team

Built with ❤️ at CTRL HACK DEL by:

- **Jason Tan** – [@Jason-Tan1](https://github.com/Jason-Tan1)
- **Kurt Jallo** – [@kurtjallo](https://github.com/kurtjallo)
- **Daniel Chahine** - [@DanielChahine0](https://github.com/DanielChahine0)


## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

## 🙏 Acknowledgments

- **Google Gemini** for the incredible speed and structured output capabilities.
- **ElevenLabs** for the natural-sounding voice API.
- **CTRL HACK DEL** for the creating such a memorable hackathon.

<div align="center">

Made at York University's CTRL HACK DEL

[⬆ Back to Top](#)

</div>
