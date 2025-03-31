import { Plugin, MarkdownRenderer, Setting } from "obsidian";

export default class NativeTransclusionPlugin extends Plugin {
  async onload() {
    console.log("Loading Native Transclusion Plugin");

    // Load settings
    await this.loadSettings();

    // Register the setting tab
    this.addSettingTab(new NativeTransclusionSettingTab(this));

    // Set to track visited files and prevent loops
    this.embeddedFiles = new Set();

    this.registerMarkdownPostProcessor(async (el, ctx) => {
      let transclusions = el.querySelectorAll("span.internal-embed");

      for (let transclusion of transclusions) {
        let filePath = transclusion.getAttribute("src");

        // Check for explicit !![[file]] syntax
        let isExplicit = transclusion.outerHTML.includes("!![[");

        if (this.settings.renderAllTransclusions || isExplicit) {
          if (filePath) {
            let file = this.app.vault.getAbstractFileByPath(filePath);
            if (file && file instanceof this.app.vault.getFileClass()) {

              // Detect infinite loop by checking if this file is already being embedded
              if (this.embeddedFiles.has(filePath)) {
                console.warn(`⚠️ Infinite embed loop detected! Skipping: ${filePath}`);
                let warning = createDiv({ text: `⚠️ Infinite loop detected: ${filePath}`, cls: "embed-warning" });
                transclusion.replaceWith(warning);
                continue;
              }

              // Mark file as embedded to prevent loops
              this.embeddedFiles.add(filePath);
              let fileContent = await this.app.vault.read(file);

              // If heading shifts are enabled, adjust the heading levels
              if (this.settings.shiftHeadings) {
                fileContent = this.shiftHeadings(fileContent, transclusion);
              }

              // Create a container for rendering
              let container = createDiv();
              container.addClass("native-transclusion");

              // Render the embedded content
              await MarkdownRenderer.render(this.app, fileContent, container, filePath, ctx);

              // Replace transclusion element with native-rendered content
              transclusion.replaceWith(container);

              // Remove file from embedded set after processing
              this.embeddedFiles.delete(filePath);
            }
          }
        }
      }
    });
  }

  /**
   * Adjusts heading levels in embedded content to prevent duplicate H1s
   */
  shiftHeadings(content, transclusion) {
    let parentHeaderLevel = this.getParentHeaderLevel(transclusion);
    if (parentHeaderLevel === null) return content; // No change if not inside a header section

    return content.replace(/^(#{1,6})\s+/gm, (match, hashes) => {
      let newLevel = Math.min(hashes.length + parentHeaderLevel, 6);
      return "#".repeat(newLevel) + " ";
    });
  }

  /**
   * Determines the parent heading level of a transclusion
   */
  getParentHeaderLevel(transclusion) {
    let parent = transclusion;
    while (parent) {
      if (parent.tagName && /^H[1-6]$/.test(parent.tagName)) {
        return parseInt(parent.tagName.charAt(1));
      }
      parent = parent.parentElement;
    }
    return null; // Not inside a header section
  }

  async loadSettings() {
    this.settings = Object.assign({ 
      renderAllTransclusions: false,
      shiftHeadings: false 
    }, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

// Plugin Settings Tab
class NativeTransclusionSettingTab extends PluginSettingTab {
  constructor(plugin) {
    super(plugin.app, plugin);
    this.plugin = plugin;
  }

  display() {
    let { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Native Transclusion Settings" });

    // Toggle 1: Render all transclusions as native content
    new Setting(containerEl)
      .setName("Render all transclusions as native content")
      .setDesc("If enabled, all ![[file]] transclusions will render as native content. If disabled, only !![[file]] transclusions will be processed this way.")
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.renderAllTransclusions)
        .onChange(async (value) => {
          this.plugin.settings.renderAllTransclusions = value;
          await this.plugin.saveSettings();
        }));

    // Toggle 2: Adjust embedded file headings
    new Setting(containerEl)
      .setName("Shift headings in embedded content")
      .setDesc("If enabled, headings in embedded files will adjust based on their position in the main file to maintain hierarchy.")
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.shiftHeadings)
        .onChange(async (value) => {
          this.plugin.settings.shiftHeadings = value;
          await this.plugin.saveSettings();
        }));
  }
}