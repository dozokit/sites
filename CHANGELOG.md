# Changelog

## 0.1.6 – 2026-10-26

- An update button: Settings → Account → Updates adds it to your copy on GitHub, then Actions → Update Dozokit Sites → Run workflow installs the latest release, once it checks the release is signed by Dozokit. A wrong or missing signature stops it and changes nothing.

## 0.1.5 – 2026-10-26

- The app calls itself Dozokit Sites everywhere, instead of "the builder".
- Settings shared by all your sites are in the top bar on every page; a site's own settings are its Site settings tab.
- Links to a part of Settings (#settings/help, #settings/account, #settings/connections) open it there, and the menu beside Settings jumps to each group.

## 0.1.4 – 2026-10-26

- How to connect Claude, step by step with your builder's own address to copy: on the first screen, in Settings → Connections, and in the editor when no Claude has used your builder for 30 days.
- Addresses show as a plain link with a copy button, not in a box.

## 0.1.3 – 2026-10-26

- Each site has an Address tab: where the site is, your own domain step by step (need one, bought elsewhere, or already on Cloudflare, each with its Cloudflare link), a Check and connect button, and the Google Maps link.
- The editor has a History button: every version, beside the page, with Go back to this.
- Settings are grouped. A site's: Connections, then Keep or remove. The builder's: Connections (Claude, email, Dozokit Analytics), Help and Account, with a menu beside them.

## 0.1.2 – 2026-10-26

- Claude can put a site on your own domain: once you've added the domain in Cloudflare, ask it to connect it. It checks the domain reaches your builder first and says what's missing if not.
- Pointing at things for Claude no longer selects the page's text on Shift+click, and parts of the page aren't named after one-letter CSS classes any more.
- Texts in the builder say "ask Claude" where they still said "ask the chat".

## 0.1.1 – 2026-10-26

- The editor has two clear modes. By default, texts and photos you can change yourself are outlined in green ("Edit text · free") and open on a click; nothing else reacts. "Point at something for Claude" switches to orange: anything can be picked at any level, and the prompt for Claude fills itself.
- A phone's call bar no longer shows on desktop when a site's own CSS styles it.
- Whole-page screenshots for Claude load every photo first, so galleries no longer look empty.

## 0.1.0 – 2026-10-26

- First release: a builder in your own Cloudflare account, designed with Claude or ChatGPT through its connector, with free text and photo edits, a photo library per site, versions and undo, several sites per builder, own domains, contact form emails through Resend, and Dozokit Analytics.
