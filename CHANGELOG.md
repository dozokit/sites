# Changelog

## 0.1.11 – 2026-10-29

- Fixed: on Cloudflare's free plan, signing in failed after the password was changed in Settings (checking it took more computing time than the free plan allows per visit). A password changed from now on is checked within the limit. One changed before this version still needs the paid plan once: if signing in fails, edit the PASSWORD secret in your Cloudflare dashboard to sign in with that instead.

## 0.1.10 – 2026-10-27

- Fixed: Settings → Usage said a token made with its link "doesn't reach any Cloudflare account". The link now also asks for Account Settings (read), so the builder finds your account by itself. With a token made before, paste your account ID in the new field: it's the long code after dash.cloudflare.com/ in your dashboard's address.

## 0.1.9 – 2026-10-27

- More than one page: Claude can add pages (Services, Contact…, each in the menu) and a blog (a list of posts at /blog, each post at /blog/<name>). You pick the page to edit at the top of the editor, and change texts and photos on it as on the home page.
- Every site gets a legal notice, a privacy page and a cookie page, linked at the bottom of each page and written from Site details (new: legal form, company number, publication director) and from what the site really does.
- Photos from your phone: the Photos tab shows a code to scan, and the photos you pick on your phone arrive in the library, no password needed (the link works 30 minutes).
- Settings → Usage: today's use of Cloudflare's free plan (visits and requests, database rows, screenshot minutes for Claude), with a read-only token you paste once.
- Settings, Help, Account, Updates and Sign out are in one menu at the top right of every screen; a site's own tabs show only that site.
- After publishing, a "Use your own domain" step when the site still has its Dozokit Sites address.
- A fresh install's address says Dozokit Sites is installed, with a link to your builder, until you publish a site.
- Fixed: a new copy made with the Deploy button builds again (the update button's text no longer lives in the .github folder, which the copy doesn't have).

## 0.1.8 – 2026-10-26

- Site details, in the editor bar: the phone and email (a new one replaces the old one in every button, link and block of the page, blocks Claude wrote included), the logo, the favicon and the Google Maps link.
- Favicon: when Claude reads your current site it takes that site's own icon, and you can change it in Site details or go back to the generated one.

## 0.1.7 – 2026-10-26

- Dozokit Sites speaks French: every screen, message, step-by-step guide, and the page where Claude asks your permission. It follows your browser's language; Settings → Account → Language changes it. The prompt for Claude is written in your language too.
- The Google Maps link goes online as soon as you save it, without publishing your other changes.
- Claude keeps the booking tool a business already has (RestoPro, TheFork, Zenchef, Calendly…) with a Book button to it, instead of dropping online booking.
- The steps to connect Claude end with "click Add". The new-version banner links to the update button.
- Fixed: an extra History button in the Style window.

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
