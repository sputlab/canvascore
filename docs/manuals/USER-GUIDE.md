# CanvasCore User Guide

*For CanvasCore 0.14.1 · for editors and administrators*

CanvasCore is where you build and update your website. You put pages together from ready-made blocks (text, images, buttons, galleries, forms and more), see them exactly as visitors will, and publish them when they're ready. Your work stays private as a draft until you publish it, unsaved changes are backed up on your device, and every saved version of a page is kept for a while, so a lost connection, an expired session or a wrong edit doesn't cost you your work. This guide covers day-to-day work. For the full list of blocks, see the [Block Reference](BLOCK-REFERENCE.md). For installation, accounts and server settings, see the [Administrator Guide](ADMIN-GUIDE.md).

## Contents

1. [Getting started](#1-getting-started)
2. [Pages](#2-pages)
3. [The page editor](#3-the-page-editor)
4. [Editing text](#4-editing-text)
5. [The settings panel](#5-the-settings-panel)
6. [Drafts and publishing](#6-drafts-and-publishing)
7. [Version history](#7-version-history)
8. [Templates and global masters](#8-templates-and-global-masters)
9. [Collections](#9-collections)
10. [Media](#10-media)
11. [The menu](#11-the-menu)
12. [Global Options](#12-global-options)
13. [Administration (admins only)](#13-administration-admins-only)
14. [Good to know and troubleshooting](#14-good-to-know-and-troubleshooting)

---

## 1. Getting started

### Roles

There are two roles:

- **editor**: builds and edits pages, collection items, media, the menu and most global options.
- **admin**: can do everything an editor can, and also manages accounts, backups, form submissions, collections and redirects, and can use custom code (the **Custom HTML** block and **Custom Code** settings).

Your role is shown under your name at the bottom of the sidebar.

### Signing in

1. Open the CanvasCore address your administrator gave you. The sign-in screen shows your site's name and icon (its favicon), once they are set in **Global Options**.
2. Enter your **Username** and **Password**.
3. Click **Login**.

If the sign-in screen says "CanvasCore is not set up yet", the site hasn't been installed: ask your administrator (it's done once, with `install.php`; see the [Administrator Guide](ADMIN-GUIDE.md#33-run-the-setup-wizard)).

If you see "Your session expired" above the form, your unsaved changes were backed up. They'll be offered to you after you sign in (see [Unsaved work found](#unsaved-work-found)).

### The first password change

The first time you sign in with the temporary password an administrator gave you (for a new account, or after a reset), CanvasCore asks you to **Set a new password**.

1. Type a **NEW PASSWORD** of at least 8 characters.
2. Type it again in **CONFIRM PASSWORD**.
3. Click **Save and continue**.

To stop without changing it, click **Log out**. You can't use CanvasCore until you set a new password.

### Changing your password

Anyone, editor or admin, can change their own password at any time.

1. At the bottom of the sidebar, click the key icon next to your name (**Change your password**).
2. Type your **Current password**.
3. Type the new one in **New password (at least 8 characters)** and again in **Repeat the new password**. It can't be `admin`, your username or your current password.
4. Click **Change password**. A notification says "Password changed.". If you're signed in on other computers or browsers, you're signed out there; this one stays signed in.

If the current password is wrong, or the two new ones don't match, the box tells you and nothing changes. Five wrong current passwords within 15 minutes pause password changes and sign-ins for your account, from that computer, for 15 minutes. If you've forgotten your password, ask an administrator to set a new one.

### The sidebar

Every screen except the page editor has a sidebar on the left. On a narrow screen, open it with the menu button at the top left. The top of the sidebar shows your site's name and icon, and the browser tab says "*Site name* · Admin". Both come from **Global Options** (see [Site identity & SEO](#site-identity--seo)); without a favicon, the default CanvasCore icon is shown.

- **Publish Site**: rebuilds and publishes the whole site (see [Publish vs Publish Site](#publish-vs-publish-site)).
- **Content**: **Pages**, **Collections**, **Templates**, **Media**.
- **Site**: **Menu**, **Global Options**.
- **Administration** (admins only): **Submissions**, **Accounts**, **Backup**, **Updates**, **Block packages**, **Import from WordPress**.

At the bottom you see your name, your role, two icons (the key, **Change your password**, and the arrow leaving a box, **Log out**) and the CanvasCore version. The **ⓘ** next to the version opens **About CanvasCore**: the version and build, and links to the CanvasCore website, the source code on GitHub, the Discord community, the address for bugs and suggestions (bug@sputlab.com) and the donation page. If it says "Editor v… / server v…: reload the page after updating", CanvasCore was just updated. Reload the page in your browser.

### Session expiry

To keep the site safe, you're signed out after a period of inactivity. The default is 30 minutes, and an administrator can change it. Working in the editor counts as activity. Even if you keep working, you sign in again at least once every 7 days. You're also signed out at once if your password is changed or reset elsewhere, or your account is deleted.

- Shortly before it ends, a yellow bar says "Your session expires in m:ss due to inactivity". Click **Stay signed in**, or just move the mouse or press a key.
- If it does expire, a **Session expired** screen covers the app. Your work underneath is not lost. Enter your password and click **Sign in and continue** to carry on exactly where you were. Anything that was being saved when the session ended is finished automatically.
- If the screen warns that "A local backup could not be stored on this device", do not close or reload the tab until you've signed in again.

### Unsaved work found

If you closed the browser, reloaded the page or your session expired with unsaved changes, CanvasCore offers them when you sign in again on the same device. A box titled **Unsaved work found** lists each one (a page, a collection item, the menu, the global options and so on).

- Click **Restore** to open it with your changes.
- Click the bin icon to throw it away. CanvasCore asks you to confirm.
- Click **Decide later** to close the box. The backups are kept.

### Notifications and confirmations

- **Notifications** appear at the corner of the screen ("Draft saved.", "Published."). Successes disappear after a few seconds. Errors stay until you close them with the **×**. Read error messages carefully: they tell you whether your changes are still safe.
- **Confirmation dialogs** appear before anything that can't be undone, such as deleting a page. The red button does the action. **Cancel**, the **Esc** key or a click outside the box cancels. **Enter** confirms.

---

## 2. Pages

Click **Pages** in the sidebar to see every page of the site.

### The page list

Each row shows the page title, its address (for example `/about`), its status, the last update and the author.

- **Search**: type in **Search by title or URL…**.
- **Filter by status**: **All**, **Published**, **Modified** or **Drafts**. Each shows how many pages it has.
- **Sort**: **Recently updated** or **Title (A–Z)**.
- If nothing matches, click **Clear filters**.

The status badges mean:

| Badge | Meaning |
| --- | --- |
| **Draft** | Never published. Only people signed in to CanvasCore can see it. |
| **Published** | Online, and what you see in the editor is what's online. |
| **Modified** | Online, but it has saved changes that aren't published yet. |

### Page actions

On each row you can:

- **Edit**: opens the page in the editor. You can also click the title or double-click the row.
- **View online** (the arrow icon): opens the live page in a new tab. Not shown for drafts.
- **Duplicate** (the copy icon): makes a copy called "… (copy)" as a new draft. If the page has unpublished changes, the copy includes them.
- **Delete** (the bin icon): deletes the page after you confirm. If it's online, it's removed from the site right away. This can't be undone.

### The Home page

The home page is the one visitors see at your site's main address. It shows a **Home** badge in the list, and its address is `/`.

To make a page the home page:

1. Open the page in the editor.
2. Click an empty area of the canvas so no block is selected.
3. In **Page Settings**, open **Page Structure**.
4. Tick **Set as Homepage (site root)**.
5. Publish the page.

### Creating a page

To create a blank page:

1. Click **New Page**.
2. A new draft called "New Page" opens in the editor.
3. Change its name in **Page Settings › Page Info › Internal Title**. The address follows the title until you edit it yourself or publish the page.

To start from a ready-made layout:

1. Click **From a template** (or **Templates** in the sidebar).
2. Read the descriptions and the list of sections in each template.
3. Click **Use template**. A new draft page opens, which you can change freely.

### Page settings

When no block is selected, the right-hand panel shows **Page Settings**:

- **Page Info**: **Internal Title** and **URL (Slug)**. The slug is the page's address. If another page already uses it, a red message tells you to choose another one.
- **Page Structure**: **Set as Homepage (site root)**, **Page Layout** (**Boxed (Centered)** or **Full Width**), **Maximum Width** for boxed pages, and the page **Background Color**.
- **SEO & Meta Data**: what search engines and social networks show (see below).

### Search engines and sharing (SEO & Meta Data)

Open **Page Settings › SEO & Meta Data**:

- **Meta Title**: the title shown in search results. If you leave it empty, the page title is used. A counter next to the label (for example "52 / 60") turns amber when the text is longer than search engines usually show.
- **Meta Description**: one or two sentences shown under the title in search results. Its counter goes up to 160.
- **Social share image**: the picture shown when someone shares the page on a social network or in a chat. Type an address, or click the blue image button to choose one from the media library. The best size is 1200 × 630. If it's empty, the site's **Default social image (OG)** from Global Options is used.
- Two previews show how the page will look **in a search result** and **as a shared link**. They change as you type.
- **Hide this page from search engines**: asks search engines not to list the page, and leaves it out of the sitemap and of the site search. Useful for thank-you pages, campaign pages or legal pages. Visitors who have the address can still open it.

Like everything else on the page, these settings go online when you publish.

---

## 3. The page editor

The editor has a top bar, the **Add** / **Layers** panel on the left, the canvas in the middle and the settings panel on the right.

### The top bar

From left to right:

- **Pages** (back arrow): returns to the page list. For a collection item it says **Collections**, and for the global header or footer it says **Global Options**.
- The page title and its status: **Draft**, **Published** or **Modified · draft**.
- The save state:
  - "All changes saved".
  - "Unsaved changes · backed up on this device": you have changes that aren't saved to the site yet, but they're safe on this device.
  - "Unsaved changes: local backup failed": save soon.
- **Preview size**: **Desktop**, **Tablet** or **Mobile**. The canvas resizes so you can check how the page looks on each screen.
- **Undo** and **Redo**.
- **Version history** (the clock icon): earlier saved versions of the page or item (see [Version history](#7-version-history)). Not shown for the global header and footer.
- **Discard draft**: only on a page that is online and has unpublished changes (see [Drafts and publishing](#6-drafts-and-publishing)).
- **Save Draft**: saves without publishing.
- **Publish**: saves and puts the page online.

### Showing and hiding the side panels

Use the small buttons at the edges of the canvas (**Hide panel** / **Show panel**) to close or open the left and right panels and give the canvas more room. CanvasCore remembers your choice in this browser. On small screens the panels start closed.

### Adding blocks (the Add tab)

The **Add** tab lists every block, grouped into **Layout**, **Basic**, **Sections**, **Interactive**, **Lists & data** and **Business & dynamic**, plus **Block packages** once an admin has installed any. Click a group's title to fold or unfold it. For what each block does, see the [Block Reference](BLOCK-REFERENCE.md).

To add a block:

1. Optional: type in **Search blocks…** (for example "faq", "map" or "price").
2. Choose where it goes:
   - If a **Section**, **Container**, **Flex Row** or **CSS Grid** is selected, the block goes inside it, at the end. The line under the search box says "Adds inside the selected …".
   - Otherwise it goes at the end of the page ("Adds at the end of the page").
3. Click the block.

If you've copied a block (see [Duplicating, copying and pasting blocks](#duplicating-copying-and-pasting-blocks)), a **Paste copied …** button at the top of the Add tab pastes it, for example **Paste copied Hero**.

At the bottom of the Add tab you also find **My templates** and **Global masters** (see [Templates and global masters](#8-templates-and-global-masters)).

Editors don't see the **Custom HTML** block. Only admins can add it.

To give visitors a search box for your whole site, add the **Site Search** block (in **Business & dynamic**). It searches the titles, descriptions and texts of published pages and collection items. See the [Block Reference](BLOCK-REFERENCE.md).

### The page structure (the Layers tab)

The **Layers** tab shows the page as a tree (**PAGE STRUCTURE**). Blocks inside a container are indented under it.

- Click a row to select that block. Click the arrow next to a container to fold or unfold it.
- To move a block, drag it by its handle (the dotted grip on the left of the row):
  - A **blue line** above or below a row means the block lands before or after it.
  - A **highlighted row** with a dashed outline means the block goes inside that container. Drop on the middle of a Section or Container to put a block inside it.
  - You can't drop a container inside itself.
- To duplicate a block, click the copy icon on its row (**Duplicate**). The copy appears right below it.
- To delete a block, click the bin icon on its row and confirm with **Delete block**.
- The buttons at the bottom (**+ Section**, **+ Container**, **+ Flex Row**, **+ Text**) add a block inside the selected container, or at the end of the page when nothing is selected.

### Selecting blocks on the canvas

- Click a block to select it. It gets a blue outline and the settings panel shows its options.
- Click an empty area of the page, or press **Esc**, to deselect. The panel goes back to **Page Settings**.
- In the panel, the back arrow next to the block name also returns to Page Settings.

### Moving blocks on the canvas

When a block is selected, a small blue label with the block's type appears above it. Drag that label up or down to change the block's position among its neighbours. To move a block into a different container, use the **Layers** tab.

You can also move the selected block one step up or down among its neighbours with **Alt+↑** and **Alt+↓** (**Option** on a Mac), or with the **Move up** and **Move down** arrows under the settings panel header.

### Resizing and spacing on the canvas

When a block is selected, small handles appear on its edges. Drag one to change the value; the number appears beside the handle while you drag.

- **Orange handles, outside the block**: the **margin** (the space around it), on all four sides.
- **Green handles, inside the block**: the **padding** (the space between its edge and its content), on all four sides.
- **Blue handle on the right edge**: the **width**. **Blue handle on the bottom edge**: the **height**.

The values are set for the device you are previewing (**Desktop**, **Tablet** or **Phone**, as in the Style tab). A side you don't drag keeps its value, so a block centred with **Block Alignment** stays centred when you change its padding. Each drag is one undo step: **Ctrl/Cmd+Z** takes the whole drag back.

With the keyboard: press **Tab** until a handle is focused, then use the arrow keys along its direction (**Left** and **Right** for a side on the left or right, **Up** and **Down** for the others). Hold **Shift** to move 10 px instead of 1 px.

### The block menu (right-click)

Right-click a block on the canvas to open its menu. It selects the block first, and acts on that block:

- **Duplicate**: a copy right below it (as **Ctrl/Cmd+D**).
- **Move up** and **Move down**: one place among its neighbours (as **Alt+↑** and **Alt+↓**). Off when the block is already first or last among its neighbours.
- **Copy style**, then **Paste style**: copy the look of the block and paste it onto this one. See [Copy & paste style](#style-tab).
- **Save as template**: asks for a name and keeps a copy under **Add › My templates**.

Press **Esc**, click elsewhere, or scroll the page to close the menu.

### Duplicating, copying and pasting blocks

**Duplicate** makes a copy of the selected block, with everything inside it, right below the original. The copy is selected so you can change it straight away. Press **Ctrl/Cmd+D**, or click **Duplicate** in the settings panel (under the header) or on the block's row in **Layers**.

**Copy and paste** lets you reuse a block on another page:

1. Select the block and press **Ctrl/Cmd+C**, or click **Copy** under the settings panel header. A notification confirms it.
2. Open the page where you want it. It can be another page, a collection item, or the same page, even in another browser tab.
3. Choose where it goes:
   - Select a **Section**, **Container**, **Flex Row** or **CSS Grid** to paste it inside, at the end.
   - Select any other block to paste it right after that block.
   - Select nothing to paste it at the end of the page.
4. Press **Ctrl/Cmd+V**, or click **Paste copied …** at the top of the **Add** tab.

The pasted block is selected. You can paste the same block as many times as you like. The copied block is kept in this browser until you copy another one, so it doesn't follow you to another computer. It isn't a template either: to keep a block for good, use **Save as template** (see [My templates](#my-templates-saved-blocks)).

If you've selected some words on the page, **Ctrl/Cmd+C** copies those words as usual instead of the block.

### Deleting blocks

Select the block, then do one of these:

- Press **Delete** or **Backspace**. The block is removed at once and a notification reminds you that **Ctrl/Cmd+Z** brings it back.
- Click the bin icon in the settings panel header (or on its row in **Layers**) and confirm with **Delete block**.

If it's a container, everything inside it is deleted too. You can bring it back with **Undo**.

### Keyboard shortcuts

| Keys | What it does |
| --- | --- |
| **Ctrl+S** / **Cmd+S** | Save draft (works while you type, too) |
| **Ctrl+Z** / **Cmd+Z** | Undo |
| **Ctrl+Shift+Z** / **Cmd+Shift+Z** | Redo |
| **Ctrl+Y** | Redo (Windows and Linux) |
| **Ctrl+D** / **Cmd+D** | Duplicate the selected block |
| **Ctrl+C** / **Cmd+C** | Copy the selected block (when no words are selected) |
| **Ctrl+V** / **Cmd+V** | Paste the copied block |
| **Alt+↑** / **Alt+↓** (**Option** on a Mac) | Move the selected block up or down |
| **Delete** / **Backspace** | Delete the selected block (Undo brings it back) |
| **Esc** | Deselect the block |

The block shortcuts work only when you aren't typing in a text or a field. While you're typing in a text or a settings field, **Ctrl/Cmd+Z** undoes your typing in that place, not changes to the page, and **Delete**, **Backspace** and the arrows work on the text as usual.

### Undo

**Undo** goes back one change at a time; **Redo** goes forward again. Typing in a settings field counts as one step, not one step per key: a word or a sentence you type without pausing is undone in one go. Undo works until you leave the page. To go back further, use [Version history](#7-version-history).

---

## 4. Editing text

You can edit text directly on the canvas, so it looks exactly as it will on the site. This works for **Text**, the title and subtitle of a **Hero**, the text of **Image + Text** and the title of a **Form**.

### Editing in place

1. Click the text on the canvas. The block is selected and the cursor goes where you clicked.
2. Type. A toolbar floats above the text.
3. Click outside the text when you're done. **Your change is kept when you leave the text.** Then save the draft or publish as usual.

You can edit the same text in the settings panel (**Content** tab). That box has the same toolbar.

### The toolbar

Titles and short texts (such as the Hero title) get a shorter toolbar. Body text gets the full one.

| Tool | What it does | Short toolbar |
| --- | --- | --- |
| **Text style** | **Paragraph**, **Heading 1** to **Heading 4**. The full toolbar also has **Quote** and **Code block**. | Yes |
| **Font** | **Theme font**, **Sans serif**, **Serif**, **Monospace** | No |
| **Size** | **Normal**, **Small**, **Large**, **Extra large**, **Huge** | No |
| **Bold**, **Italic**, **Underline** | Ctrl/Cmd+B, I, U | Yes |
| **Strikethrough**, **Subscript**, **Superscript** | | No |
| **Text color** | A palette, a **Site** color, a custom color with **Apply**, or **Default** to remove it | Yes |
| **Highlight** | A background color behind the text. **None** removes it. | Yes |
| **Align left**, **Center**, **Align right** | The full toolbar adds **Justify** | Yes |
| **Bulleted list**, **Numbered list** | | No |
| **Quote** | Turns the paragraph into a quote, or back | No |
| **Horizontal line** | Inserts a dividing line | No |
| **Link** | Adds or edits a link (Ctrl/Cmd+K) | Yes |
| **Image** | Inserts an image in the text | No |
| **Table** | Inserts or edits a table | No |
| **Clear formatting** | Removes styles, links and headings from the selection | Yes |
| **Undo**, **Redo** | For your typing in this text | Yes |
| **Edit HTML** | Shows the text's HTML so you can fix it by hand | Yes |

**The Site color.** In **Text color** and **Highlight**, the **Site** swatch uses your brand color from Global Options. If the brand color changes later, this text changes with it.

### Links

1. Select the words you want to link, or put the cursor where the link should go.
2. Click **Link** (or press Ctrl/Cmd+K).
3. Type the **Address**, or pick a page from **Link to a page…**.
4. If nothing was selected, type the **Text** to show.
5. Optional: tick **Open in a new tab** or **Nofollow (search engines ignore it)**.
6. Click **Apply**.

To change a link, put the cursor in it and click **Link** again. To remove it, click **Remove**.

### Images in text

1. Click **Image**.
2. Click **Choose from the media library**, or paste an image address and add a **Description (alt text)**.
3. Click **Insert**.

### Tables

1. Click **Table**.
2. Move over the grid to choose the size (up to 6 × 6). Leave **First row is a header** ticked if you want a header row.
3. Click to insert.

With the cursor inside a table, **Table** offers **Row above**, **Row below**, **Column left**, **Column right**, **Toggle header row**, **Delete row**, **Delete column** and **Delete table**.

### Pasting

When you paste from Word, Google Docs or a web page, CanvasCore cleans the text and keeps only simple formatting such as headings, bold, lists and links. Text is cleaned again when you save: scripts and other active code (also typed in **Edit HTML**) are removed, and styles that could move text over the page or load something are dropped. To paste plain text only, use **Ctrl+Shift+V** (**Cmd+Shift+V** on a Mac). You can't drag image files into text: use **Image** instead.

---

## 5. The settings panel

When a block is selected, the right-hand panel shows its name and three buttons at the top:

- **Save as template** (the save icon): keeps a reusable copy of the block (see [My templates](#my-templates-saved-blocks)).
- **Master**: makes the block a global master (see [Global masters](#global-masters)).
- **Delete block** (the bin icon).

Just below the header, a small bar of quick actions works on the selected block:

- **Move up** and **Move down** (the arrows): one step among its neighbours. An arrow is greyed out when the block is already first or last.
- **Duplicate**: a copy right below it.
- **Copy**: copies it so you can paste it on any page (see [Duplicating, copying and pasting blocks](#duplicating-copying-and-pasting-blocks)).

Point at a button to see its name and keyboard shortcut.

Below are three tabs: **Content**, **Style** and **Advanced**. Each tab has sections you can open and close.

### Content tab

This tab holds the block's own settings: its texts, images, links, items and layout options. They differ for each block. See the [Block Reference](BLOCK-REFERENCE.md). **Section** and **Container** have no Content tab, because you add blocks inside them and set their look in **Style**.

**Choosing an image.** Click the blue image button (**Choose from the media library**) next to an image field. The **Choose an image** window opens:

- Each image shows its size in pixels and its file size.
- Type in **Search by name or description…** to find an image, or pick a folder in the list next to it (**All images**, **Not in a folder** or one of your folders). The newest images come first.
- Click **Upload** to add new images. You can choose several files at once. They go into the folder you picked, and the upload progress panel shows how each one went.
- Click an image to use it. Press **Esc**, or click **×**, to close without choosing.

If the image has a description in the Media Library and the block's description (alt text) field is still empty, the description is filled in for you. A description you've already typed in the block is never replaced.

**Custom HTML for editors.** Editors can see the code of a **Custom HTML** block an admin added, but can't change it. They can still move or delete the block. When an editor saves the page, the admin's code (and any custom CSS) is kept as it was.

### Style tab

**Edit styles for: Desktop, Tablet, Phone.** At the top of the tab, this chooses the device you are styling. It is the same as the preview size in the editor. On **Desktop**, the values apply everywhere. On **Tablet** and **Phone**, they override the desktop values only on those screens (up to 1024 px and up to 767 px). A value set back to what the screen would get anyway is removed, and **Reset** gives a device the inherited styles again. Hidden devices are also set here, in **Advanced › Visibility**.

**Copy & paste style** (an accordion at the top of the tab):
- **Copy style** keeps this block's look: its styles, and its tablet and phone overrides.
- **Paste onto this block** applies the copied look to this block.
- The list of **other blocks on the page** (nested ones too, such as a Hero inside a section): tick the blocks to paste onto and press **Paste onto selected**. **Select all … blocks** ticks every block of the same type.
- **Reset to global style** removes this block's own styles and device overrides, so it follows the site's styles again. It asks first. Its text style and its entrance animation stay, and so do the devices it is hidden on.

A paste is one undo step. The copied look is kept until you copy another one.

**Size & Dimensions**
- **Width**, **Height**, **Max Width**, **Min Height**. Type values such as `100%`, `500px` or `50vh`.
- **Block Alignment (Centering)**: places the block left, centered or right.

**Spacing (Margin & Padding)**
- **MARGIN (Outer Space)** is the space around the block. **PADDING (Inner Space)** is the space inside it, between its edge and its content.
- Each has four boxes: TOP, RIGHT, BOT (bottom) and LEFT. You can use `px`, `rem` or `%`.

**Typography**
- **Text style**: a text style from **Global Options › Text styles** (Heading 1 to Heading 6, Body, Small or Button). The font, size, weight and line height come from it. The values you set below win over it.
- **Font Size**, **Line Height**, **Font Weight**, **Text Transform**, **Text Color** and **Letter Spacing**.

**Background & Alignment**
- **Background Color**, and **Text Alignment** (left, center, right).

**Borders & Shadows**
- Border **Thickness**, **Style** (**Solid**, **Dashed**, **Dotted**), **Color** and **Border Radius** (rounded corners).

**Adjusting numbers with the keyboard.** In fields marked **↑/↓**, and in all spacing boxes, press the **Up** or **Down** arrow to change the value by 1 (or 0.1 for decimals). Hold **Shift** to change it by 10 (or 1). The unit stays as it is.

**Color fields.** Every color field has a swatch to pick a color, a box where you can type any color (such as `#1e293b`), a **Transparent** button for no fill, and **×** to go back to the default. Text colors have no Transparent button.

### Advanced tab

**Entrance Animation.** This plays once when the block scrolls into view. Choose it in **When the block scrolls into view**:

**None**, **Fade in**, **Fade up**, **Fade down**, **Slide in from the left**, **Slide in from the right**, **Zoom in**, **Zoom out**, **Flip up**, **Flip sideways**, **Rotate in**, **Blur in**, **Bounce in**.

When an animation is chosen you can also set:
- **Speed**: **Normal (0.8s)**, **Fast (0.5s)**, **Slow (1.2s)** or **Very slow (1.8s)**.
- **Delay**: **No delay**, or from 0.1s to 1.5s.

Tip: give blocks that sit side by side growing delays (0.1s, 0.2s, 0.3s) so they appear one after the other.

**Hover Effect.** This happens when a visitor points at the block: **None**, **Lift**, **Grow**, **Shrink**, **Shadow**, **Glow (brand color)**, **Tilt**, **Brighten**, **Black & white → color**. It also works on the canvas, so point at the block to try it.

**Looping Motion.** This keeps the block moving gently: **None**, **Float**, **Pulse**, **Bounce**, **Swing**, **Heartbeat**, **Shake (every few seconds)**, **Spin (slow)**. It works best on small things such as an icon, a badge or a button, and starts after the entrance animation.

**Preview animation.** On the canvas, blocks stay still so they're easy to edit. Click **Preview animation** to play the entrance animation and looping motion once.

**Reduced motion.** Visitors who have turned off motion in their system settings don't see entrance animations or looping motion.

**Custom Code** (admins only): **CSS ID (Unique)**, **CSS Classes** and **Custom CSS**. See the [Administrator Guide](ADMIN-GUIDE.md).

### Button colors and hover

The **Button** block has its own settings in the **Content** tab:

- **Button Settings**: **Use Global Style (Brand)**, **Button Size** (**Small**, **Medium**, **Large**), **Text** and **Link**. Pick a page from **Select internal page...** or type a **Custom URL...**.
- **Colors**: **Background** (when Use Global Style is on, leave it empty to use the brand color), **Text color** and **Border**.
  - To make an **outline button**, set Background to **Transparent** and choose a Border and a Text color.
- **Button preset**: **Custom** (the colours above), or **Primary**, **Secondary** or **Outline**. A preset gives the button the colours and corners of the site's button style (see [Buttons & fields](#buttons--fields)), and the buttons that use it follow it when it changes. The colours set in the **Colors** section win over the preset.
- **Hover**: **Background on hover**, **Text color on hover**, **Border on hover** (only if the button has a border) and **Hover effect**.

The **Hover effect** choices for buttons are: **Color change only**, **Lift**, **Grow**, **Press**, **Shadow**, **Glow**, **Shine sweep**, **Outline ring**, **Pulse**.

**Hero buttons.** In a **Hero** block, open **Hero Buttons**. Each button has **Text**, **Link** and a **Style**: **Solid**, **Outline** or **Text only**. It also has **Background**, **Text color**, **Border**, **Corner radius** and an **ON HOVER** part with its own colors and **Effect** (the same list as above). Use **+ Add Button** to add one, and the arrows or bin to reorder or remove buttons.

Each Hero button also has a **Button preset** (**Custom**, **Primary**, **Secondary** or **Outline**). With a preset, the button's colours and corner radius come from the site's button style, and the **Background**, **Text color**, **Border** and **Corner radius** fields of that button are not used.

---

## 6. Drafts and publishing

### Draft, published and modified

- A **new page is a draft**. Nobody outside CanvasCore can see it.
- When you **publish** it, it goes online and becomes **Published**.
- If you change a published page and click **Save Draft**, CanvasCore keeps your changes in a hidden draft copy. The online page doesn't change. The page shows as **Modified** in the list and **Modified · draft** in the editor.
- When you open a Modified page, you always edit the draft copy.
- When you publish it, the draft copy replaces the online version.

### Save Draft

Click **Save Draft** (or press **Ctrl/Cmd+S**) to save your work without changing the live site. A notification says "Draft saved.". If saving fails, the message says so, and your changes stay in the editor and backed up on this device.

### Discard draft

On a Modified page, **Discard draft** throws away all unpublished changes and brings back the version that is online. CanvasCore asks you to confirm first.

### Publish vs Publish Site

- **Publish** (in the editor) saves this page, puts it online, and then rebuilds the site so menus and lists stay up to date.
- **Publish Site** (in the sidebar) rebuilds the whole site from the published versions of all pages. **Drafts and unpublished changes are not published.** Use it after changes that affect many pages, for example after archiving collection items.
- **Save & Publish** in **Menu** and **Global Options** saves your changes and republishes the site.

Each time the site is rebuilt, CanvasCore also updates the sitemap, the list the **Site Search** block searches in, the collections' RSS feeds and the redirects. That's why new pages only turn up in the site search, and a renamed page's old address only forwards, after a publish.

### Deleted and renamed pages

- **Deleting** a page that is online removes it from the site right away.
- **Renaming** a page's address (slug) takes effect when you publish it. When you do:
  - Links to the page are updated for you everywhere: in buttons, menus and links inside text, on other pages, collection items, the global header and footer and global masters.
  - **The old address keeps working.** Visitors and search engines that use it are sent on to the new address (a "redirect"), so bookmarks and search results don't break.
- **Renaming a published collection item** works the same way: its old address forwards to the new one after you publish. So do moving items to another collection and changing a collection's address (see [Collections](#9-collections)).
- **Deleting** a published collection item, or a whole collection, also takes its pages off the site right away.
- If you later publish a page at an address that used to forward somewhere, the page wins and the redirect is removed.
- Administrators can see every redirect, and add or remove them, in **Global Options › Redirects** (see [Redirects](#redirects-admins)).
- Other pages and collection items that are no longer published (for example an item set back to **Draft**) are removed from the site the next time the site is published.

### Local backups of unsaved work

While you work, CanvasCore keeps a backup of your unsaved changes **in this browser on this device**. The backup is cleared once you save.

- **Reopening a page with a backup.** A bar at the bottom of the editor says **Unsaved changes found** for this page. Click **Restore** to bring them back, or **Discard** to drop them.
- **After restoring.** The bar says **Restored unsaved changes**. They are not saved to the site yet: click **Save Draft** or **Publish** to keep them, or **Discard** to go back to the last saved version.
- The same applies to the **Menu** and **Global Options** screens. Use their **Save & Publish** button to keep restored changes.

Backups live only in this browser. If you switch computer or browser, they don't follow you.

### Leaving with unsaved changes

If you click the back button with unsaved changes, CanvasCore asks **Leave with unsaved changes?** **Stay** keeps you in the editor. **Leave anyway** leaves. Your changes stay backed up on this device, but they are **not** saved to the site.

---

## 7. Version history

Every time you click **Save Draft** or **Publish** and the content of a page or collection item has changed, CanvasCore keeps a copy of that version on the server. The newest 40 versions of each page and each item are kept; older ones are dropped. Unlike the backups of unsaved work, version history is kept on the server: you see it from any computer, and it includes versions saved by other people.

### Looking at an earlier version

1. Open the page or collection item in the editor.
2. Click the clock icon in the top bar (**Version history**).
3. The list on the left shows each version with its date and time, a **Draft** or **Published** badge and the name of the person who saved it. The newest is marked **latest**.
4. Click a version to see a preview of it on the right.

Press **Esc** or click **×** to close the window without changing anything.

### Restoring a version

1. Pick the version and click **Restore this version**.
2. Confirm with **Restore version**.
3. The editor now shows the blocks of that version. **Nothing is saved yet**: the restore is an unsaved change like any other.
4. Click **Save Draft** or **Publish** to keep it. If you change your mind, press **Ctrl/Cmd+Z** (or click **Undo**) to go back to what you had before.

Restoring brings back the page's blocks and their content. The settings shown when no block is selected (title, address, SEO, item settings) stay as they are now.

When you save a restored version, it becomes a new version in the list, so the one you replaced is still there if you need it. When a page or item is deleted, its history is deleted too. The global header and footer have no version history.

---

## 8. Templates and global masters

### Starter templates

**Templates** in the sidebar (or **From a template** on the Pages screen) lists ready-made page layouts. **Use template** creates a new draft page from one. See [Creating a page](#creating-a-page).

### My templates (saved blocks)

A saved block is a copy of a block, including everything inside it, that you can reuse on any page.

To save a block:

1. Select the block.
2. Click the save icon (**Save as template**) at the top of the settings panel.
3. Enter a **Template name** and click **Save template**.

To use one, open **Add › My templates** in the editor and click its name. A copy is inserted inside the selected container, or at the end of the page. Changing the copy doesn't change the template, or other copies.

To delete a saved block, click the bin next to it. Blocks already added to pages stay.

### Global masters

A master is a block shared by many pages. When you edit it once, it changes everywhere. It's useful for things like a call-to-action band or a contact strip.

To make a master:

1. Select the block.
2. Click **Master** at the top of the settings panel.
3. Enter a **Master name** and click **Create master**. The block is now linked to the master.

To insert a master on another page, open **Add › Global masters** and click its name.

To edit a master everywhere:

1. Select the master on any page. It shows a **GLOBAL MASTER** label.
2. Click **Edit Global Master**. A gold bar says **Editing a global master**.
3. Make your changes.
4. Click **Save Master & Close** to save, or **Cancel** to drop the changes.

The new version appears online on each page that uses the master the next time the site is published.

- To remove a master from one page only, select it and click the bin icon (**Remove this master from the page**).
- To delete a master from the whole site, click the bin next to it in **Add › Global masters**. This removes it from **every** page and can't be undone.

---

## 9. Collections

A collection is a group of similar pages, such as a blog, news or a portfolio. Each entry is an **item** with its own page. You show a list of items on any page with the **Collection List** block.

### Collections and items

Click **Collections** in the sidebar. The left column lists the collections, with the number of items in each. Click one to see its items.

- **Creating, renaming or deleting a collection** is for admins only: use **New collection**, type a **Name** and click **Create**. Deleting a collection deletes all its items, and their pages and the collection's RSS feed are taken off the site at once.
- **Adding an item**: click **New Item** (or **Create the first item**).
- **Editing an item**: click the pencil icon, or double-click the row.
- **Deleting an item**: click the bin and confirm. If it was published, its page is taken off the site at once. Collection lists, the site search and the sitemap are updated the next time the site is published: a bar offers **Publish now**.

### Custom fields (admins define them)

A collection can have its own **fields**, such as a price, a date, a photo or a category. Click **Fields** above the items of a collection to open them (admins can change them; editors see the list).

- **Add field** creates one. Give it a **Label** (its key is made from it), a **Type** and, if you like, tick **Required to publish**.
- **Types**: **Text**, **Rich text**, **Number**, **Date**, **Image**, **Gallery (several images)**, **Link**, **Choice** (one, or several with **Several choices can be picked**) and **Reference to an item** (an item of another collection, for example the department of a team member).
- A **Choice** field lists its choices one per line: a label on its own, or `value | label`.
- The **Arrows** move a field up or down; the bin deletes it. A deleted field's values stay in the database but are no longer shown.
- **Save fields** saves the list.

A required field must be filled in before an item can be **published**: a draft can be left incomplete, but publishing names the field that is missing.

Each item fills in its fields in the settings panel, under **Item fields** (with no block selected). Images and galleries are chosen from the media library, and a reference is picked from the items of the other collection.

### The design of a collection (admins)

A collection can have one **design**: the blocks that every item page is built from. Click **Make the design** (or **Design**, once it exists) above the items. The design opens like a page, with a banner that explains it.

- Build the layout as usual. Any text, button, image or link can show the item's own values by typing a **dynamic value** (see below). The **Dynamic values** section of the settings panel lists them, with the fields of the collection.
- **Publish Site** puts the design on every item page of the collection. Saving the design alone does not change the site until you publish.
- With a design, an item's page is the design: the item's layout is **read-only** in the editor (the banner says so). You edit its **fields** and **settings** instead. Its own blocks, if it had any, are kept and come back if the design is removed.
- Without a design, each item is built from its own blocks, as before.

**Dynamic values** are typed in any text, button, image or link of a design (or of an item's blocks):

| Type | Shows |
| --- | --- |
| `{{field:price}}` | The value of the field with that key (the key is shown in the Dynamic values list) |
| `{{field:site.text}}` / `{{field:site.url}}` | The text or the address of a link field |
| `{{field:lead.title}}` / `{{field:lead.url}}` | The title or the page of the item a reference points to |
| `{{item:title}}`, `{{item:excerpt}}`, `{{item:date}}`, `{{item:url}}` | The item's title, excerpt, date (written out, such as October 19, 2026) or address |

On the item pages the values are shown escaped, so they can't add code to the page. On any other page the placeholders are removed. In the editor, the design shows each field's name in brackets, and an item shows its real values.

### Structured data for search engines (admins)

In the **Fields** section of a collection, **Structured data for search engines** tells search engines what its items are. Choose:

- **Product** (a shop item): the **Photo**, **Description**, **Price** (a number field) and **SKU**, and the **Currency** (a three-letter code such as `EUR`) that the price is in.
- **Event**: the **Start date**, **Location** (a text field), **Image** and **Description**.
- **Person**: the **Job title**, **Photo** and **Bio**.

Each item page then carries this information in a form search engines read (schema.org). The name and the address come from the item itself. Each property only offers the fields of the right type, and a field left empty is simply not published.

### Renaming a collection (admins)

Click the pencil next to a collection in the left column, or **Rename** above its items. A form opens with the **Name** and the **Address**.

- Changing only the **Name** changes what you see in the admin and in the Collection List block's choices. The address (for example `/blog/`) stays the same.
- Changing the **Address** moves every item to a new URL (for example from `/blog/my-post/` to `/news/my-post/`). CanvasCore asks first (**Change address**). After you publish the site, each published item's old address forwards to its new one, so links and search results keep working. A bar offers **Publish now**.
- **Esc** or **Cancel** closes the form without changes. An address already used by a page or another collection is refused.

### Working on several items at once

Each row has a checkbox. Tick the items you want, or tick the box in the header to select them all. **Shift+click** a second checkbox to select (or unselect) every item in between. A bar then shows how many are selected, with:

- **Move to…** and **Move**: moves the items to another collection. A published item forwards from its old address to the new one after you publish.
- **Archive** / **Unarchive**: shown when the selection has items that can be archived or unarchived.
- **Delete**: deletes the selected items after you confirm. Published items are taken off the site at once.
- **×**: clears the selection.

Some items may be skipped, and a message lists them with the reason. For example, a published item isn't moved when the destination collection already has a published item with the same URL slug: change one of the two slugs first. Lists and the site search are updated when you publish the site, so click **Publish now** in the bar that appears.

### Categories and tags (admins define them)

Click **Categories & tags** above the items of a collection to define its taxonomies. A **taxonomy** is a kind of label, such as **Category** (an item takes one of its terms) or **Tags** (an item takes several). Tick **Several terms per item** for the second kind.

- Each taxonomy has **terms**: a name and a short **description** (shown on the term's page). Click **Add term** to add one, the bin to delete it.
- Editors can pick the terms of an item but can't change the taxonomies. Renaming a term keeps the items that have it; deleting a term takes it off the items on their next save.
- Each term has its own **listing page** (`/<collection>/<taxonomy>/<term>/`), with its live items, newest first, paginated. Each taxonomy has a page listing its terms with their counts. Both are in the sitemap and linked from the first listing page.

An item picks its terms under **Categories & tags** in its settings.

### Listing and archive pages (admins)

Every collection has a **listing** (its address, `/<collection>/`), paginated, with the newest items first. Click **Listing & archives** above the items to set:

- **Items per page**: from 3 to 50 (12 by default).
- **Year and month archives**: `/<collection>/2026/` and `/<collection>/2026/10/`, for the items of that period.
- **Filter archives**: one page for each choice of a choice field (for example `/<collection>/filter/tier/gold/`).
- **Sorted listings**: oldest first, and A to Z.

The first listing page has links to all of these, to the taxonomies and to the years. Every archive is paginated with **← Newer** and **Older →** links. Publish the site to show the archives. An address that an item already uses is kept for the item: that archive is skipped, and the publish message says so.

### Scheduled publishing

A page or an item can go live at a date and time, and come down at another one. In its settings, open **Scheduled publishing** and set **Publish at** and/or **Unpublish at**, then click **Save schedule**. Leave a field empty to clear it. The panel says in words what will happen ("Goes live at …").

- The change is made by the server at that time: on the next visit to the admin after it, or by the server's scheduler (see the [Administrator Guide](ADMIN-GUIDE.md#79-scheduled-publishing-and-cron)). The site is published again after each change.
- Times are the **server's** local time. Ask your host which time zone the server uses.
- A page that has unpublished edits waiting is not changed by its schedule: publish it by hand. An address that another live page or item already uses is skipped, and the change is reported.

### Editing an item

An item opens in the same editor as a page, with a **Collection item** badge. Build its content with blocks as usual, unless the collection has a [design](#the-design-of-a-collection-admins): then the layout is read-only and the item has only its fields and settings. With no block selected, the panel shows **Item Settings** first:

- **Status**: **Draft (not published)** or **Published**.
- **Archived (moved to the archive list)**.
- **Date**.
- **Cover image**: type an address, or click the upload button.
- **Excerpt**: a short summary shown in lists.
- **Item fields**: one input for each field of the collection (see [Custom fields](#custom-fields-admins-define-them)), under the settings.

**Page Info** (title and URL) works as for pages. In **SEO & Meta Data**, the **Meta Title** and **Meta Description** are saved for items, and when the item is shared its **cover image** is used as the picture (the **Social share image** and **Hide this page from search engines** options are for pages only). An item's address is the collection's address followed by the item's slug. If you change the address of a published item, the old address forwards to the new one after you publish.

Each collection with published items also gets an RSS feed at its address followed by `feed.xml` (for example `/blog/feed.xml`), so visitors can follow it in a feed reader. The feed lists the newest 50 items and is updated each time the site is published. It's only made when **Site address** is filled in **Global Options**.

- **Save Draft** saves the item with the status chosen in **Item Settings**.
- **Publish** marks it **Published**, saves it and republishes the site.

Items have no hidden draft copy. If you save a published item, the change goes online the next time the site is published.

### Archive and unarchive

Click the archive icon on an item's row to archive it, or unarchive it (to do this for several items at once, see [Working on several items at once](#working-on-several-items-at-once)). Archived items show an **Archived** badge. A bar then says "Archive change saved. Public lists update when you publish the site." Click **Publish now** to update the site.

### The Collection List block

Add **Collection List** (in **Business & dynamic**) to any page. In its **Content** tab:

- **Collection**: which collection to show.
- **Source**: **Active (not archived)**, **Archived only** or **All**.
- **Layout**: **Grid (cards)** or **List (rows)**.
- **Show all items (ignore limit)**, or **Items to show**.
- **Columns** (grid only): 1 to 4.
- **Show cover image**, **Show date**, **Show excerpt**.
- **Fields on each card**: tick the fields of the collection to show under each item's excerpt (for example the price or the role). The label and the value are shown.
- **Sort by**: **Newest first** (the default), **Title**, **Date**, or a field: a number, a date, a text or a choice. **Ascending** or **Descending** follows. Items without a value for the field go last.
- **Filter buttons (by a choice field)**: a choice field gives **All** and one button per choice above the list. Visitors click a button to show only the matching items, without reloading the page.

On the canvas you see grey placeholder cards. The real items are filled in when the site is published.

### The Related Items block

**Related Items** (in **Business & dynamic**) lists the items of a collection that point to the item being shown. Use it on the design of a collection: a department page can list its people, a client page its projects. In its settings:

- **Heading (optional)**, **Items of collection**, and **That point to this item through the field**: a reference field of that collection that points to this collection (the panel only offers those fields).
- **How many**, **Columns**, **Fields on each card**, and **Sort by**, as for a Collection List.

It shows nothing on other pages, and the editor says so until the block is used on a collection item.

**Related items by tag.** Set **Find items** to **That share tags with this item** to list the other items of the same collection that share terms with this one: the most shared first, then the newest. **Through the taxonomy** limits it to one taxonomy (for example Tags), or leaves it on any taxonomy.

### Faceted search

The **Site Search** block has a **Filters** section. Tick the **Collection** filter, and/or one filter per taxonomy. Visitors then see checkboxes above the results:

- The choices of one filter combine with "or" (a Tag of *Red* or *Blue*), and the filters combine with "and" (a Cuisine of *Italian* and a Mood of *Quick*).
- With a filter on, the search also works with no words: it lists the matching items, so the filters act as a browser.
- The choices shown are the ones of the published content, with how many items each has.

---

## 10. Media

Click **Media** in the sidebar to open the **Media Library**, where all your images are kept. On the left is the list of folders; on the right, the images of the folder you opened.

- **Uploading**: click **Upload Images** and choose one or more files. You can also drag files from your computer and drop them anywhere on the page. New images go into the folder that is open (with **All images** open, they go in no folder).
- **Accepted files**: images (JPG, PNG, GIF, WebP, AVIF, SVG, ICO and BMP), audio (MP3, M4A, OGG and WAV) and video (MP4 and WebM). Audio and video appear as tiles, with a type filter, and the picker of each block offers only the kind that block needs. A file must really be of its type: a script, page or document renamed to `.mp3` or `.mp4` is refused. Files over the size limit are refused with a message; if the server's own limit is the cause, the message says so.
- **SVG files** are accepted only when they contain plain drawing: files with scripts, animated links, embedded web content, links to outside files or other active content are refused. Export the SVG again as a plain SVG, or as PNG. Uploading never replaces an image already in the library, even one with the same name.
- **Searching**: type in **Search name or description…**. It searches the folder that is open.
- **Sorting**: choose **Newest first**, **Oldest first**, **Name A–Z**, **Name Z–A**, **Largest first** or **Smallest first**.
- **Copying an address**: click the copy icon under an image. If your browser blocks copying, the address appears in a box so you can copy it yourself.
- **Moving to a folder**: click the arrow icon under an image (**Move to a folder**), or drag the image onto a folder.
- **Deleting**: click the bin. The confirmation tells you where the image is still used (see [Deleting images](#deleting-images)).

### Upload progress

While files upload, a panel at the corner of the screen lists each one with its size and a progress bar, then a green tick or a red warning with the reason (for example "Not an image", or a file the server refused). The title says "Uploading 2 of 5…" and then how many were uploaded and how many failed. The panel stays until you close it with **×**, so you always know what happened. You can't close it while files are still uploading.

### Folders

Folders help you keep a large library tidy, for example **Products**, **Team** or **Blog/2026**.

- **All images** shows every image. **Not in a folder** shows the images that aren't in any folder. Each folder shows how many images it holds, including those in its sub-folders.
- **New folder** creates a folder inside the open one (or at the top level, with **All images** or **Not in a folder** open). Folders can be nested up to 5 levels. Names can use letters, numbers, spaces and `- _ . ( ) &`, up to 50 characters.
- Click a folder to open it. Its sub-folders are shown above its images.
- **Renaming or deleting a folder**: open it, then use the pencil or bin icon next to its name. Deleting a folder **deletes no image**: its images and sub-folders' images move up to the parent folder (or to **Not in a folder**).
- **Moving images**: drag one image, or a selection, onto a folder in the list on the left or onto a sub-folder; or use **Move to folder…**. In the **Move to…** box you can also pick **+ New folder…** and type a name (use `/` for a folder inside another, for example `Products/Shoes`).

Folders are only labels for finding images in the library. **The image files don't move**, so their addresses don't change and pages that use them keep working when you move or rename things.

### Selecting several images

Tick the checkbox on an image (or click its picture) to select it. **Shift+click** another one to select every image in between. **Select all** selects every image shown. A bar then shows how many are selected, with:

- **Move to folder…**
- **Copy addresses**: copies the addresses of all selected images, one per line.
- **Delete**: deletes them together (see below).
- **×**: clears the selection.

### Deleting images

Before deleting, CanvasCore checks where the images are still used: pages and their drafts, collection items (including cover images), the global header and footer, global masters, Global Options (for example the favicon) and the menu (for example the logo). The confirmation lists those places ("still used: Page: Home, Item: Summer sale…"), or says they aren't used on any page. Places that still use a deleted image show a broken image, so replace the image there first. Deleting can't be undone.

### What each image shows

Under each image you see its name, its size in pixels (for example 1600×1067), its file size, and an **Optimized** badge when phone-sized copies have been made (see below).

### Image descriptions (alt text)

Each image has a **Description (alt text)** field. Describe what the picture shows in a few words, for example "Our team at the 2025 summer party". Screen readers read it aloud to people who can't see the image, and search engines use it too.

1. Click in the field under the image and type the description.
2. Press **Enter** or click elsewhere. The description is saved.

When you later choose this image for a block, its description is filled into the block's description field for you, if that field is still empty.

### Faster images on phones

When you upload a photo, CanvasCore also makes smaller copies of it. On the published site, each visitor's browser then downloads the size that fits their screen: a phone gets a small, light copy instead of the full-size photo. Pages load faster and use less mobile data, and you don't have to resize anything yourself. The original is kept as it is, and images are never made larger: a small image doesn't need copies, so it doesn't get the **Optimized** badge. Images further down a page are loaded only when the visitor scrolls near them.

Images uploaded before this feature have no copies yet. If there are any, a button **Optimize N older images** appears next to the search box (for example **Optimize 12 older images**). Click it once and wait: it shows how many are done and how many are left. When it's finished, those images get the **Optimized** badge too. The copies are used on the site after the next publish.

### Uploading while editing

You can also upload while editing: the **Choose an image** window has an **Upload** button and a folder filter (see [Content tab](#content-tab)).

---

## 11. The menu

Click **Menu** in the sidebar to open the **Menu Builder**. A **Live preview** at the top shows the real menu as it will appear on the site. Switch it between **Desktop** and **Mobile**, and scroll inside it to try "Fixed on top". Links in the preview don't work.

When you're done, click **Save & Publish**. This saves the menu and republishes the site.

### Structure

Each row is a menu item with a **Label**, a link and some buttons.

- **Link**: pick a page from the list, choose **Custom URL…** and type the address, or choose **— No link (opens submenu) —** for a parent that only opens its submenu.
- **Reordering**: drag the grip, or use the up and down arrows.
- **Submenus**: use the indent buttons to **Nest under previous** or **Un-nest**. You can also click the green **+** (**Add submenu item**).
- **Removing**: click the red bin. There's no confirmation, but nothing is saved until you click Save & Publish.
- **Adding**: click **Add top-level item**.

### Themes

A theme sets colors, item shape, typography and effects in one click. Your links, logo, alignment and mobile settings stay as they are. The themes are: **Classic**, **Professional**, **Fresh**, **Warm**, **Midnight**, **Minimal**, **Ocean**, **Sunset**, **Earth**, **Pastel**, **Bold** and **Corporate**. The theme in use shows **In use**. Right after applying one, click **Undo** to go back.

### Style

- **Items**: **ITEM STYLE** (**Classic Link**, **Pill (Rounded)**, **Box**), **TEXT COLOR**, **HOVER TEXT COLOR**, **HOVER BACKGROUND**, **BUTTON BACKGROUND** and **BUTTON TEXT** (pill and box only), **ITEM BORDER**, **ITEM RADIUS**, and **CURRENT PAGE** (**Highlight the current page**).
- **Typography**: **FONT SIZE**, **FONT WEIGHT**, **LETTER CASE**, **LETTER SPACING** and **SPACING BETWEEN ITEMS**.
- **Bar**: **BACKGROUND COLOR**, **BACKGROUND OPACITY**, **SHADOW**, **BAR HEIGHT** and **BAR PADDING**.

### Effects

Effects are grouped. In groups marked "pick one", only one effect can be on at a time. In groups marked "combine freely", you can turn on several. Point at an effect to see a short description.

- **Hover indicator**: Underline, Center underline, Overline, Highlight, Dot.
- **Hover motion**: Lift, Grow, Pop.
- **Hover glow**: Text glow, Shadow.
- **Bar**: Glass, Glare, Accent line.
- **On scroll** (only with "Fixed on top"): Shrink, Hide on scroll down, Shadow.
- **Submenu opening**: Fade, Slide, Zoom.
- **Page load**: Slide down, Fade in, Stagger.

**Clear all** turns every effect off.

### Layout & Logo

- **Position**: **BUTTONS ALIGNMENT** (Left, Center, Right) and **STICKY** (**Fixed on top**, which keeps the menu visible while visitors scroll).
- **Logo**: **LOGO IMAGE** (type an address or click **Upload**), **LOGO ALIGNMENT**, **LOGO HEIGHT**, **LOGO / BUTTONS GAP** and **LOGO LINK** (**Homepage** or **No link**).

### Mobile

On phones the menu turns into a "hamburger" button.

- **Burger icon**: **Classic**, **Staggered**, **Two lines**, **Thin**, **Bold**, **Dots**, **Grid**, **Boxed**, an icon with the word **MENU**, or **Custom** (type your own **CUSTOM CHARACTER**).
- **Mobile bar**: **BURGER POSITION** (Left or Right), **LOGO ON MOBILE** (**Show the logo**) and **MOBILE BREAKPOINT (px)**, the screen width below which the hamburger is used.

Switch the preview to **Mobile** to check the result.

---

## 12. Global Options

Click **Global Options** in the sidebar for settings that apply to the whole site. Click **Save & Publish** to save them. This also republishes the site.

### Brand & typography

- **Primary font (Google Fonts)**: the site's main font.
- **Let the menu inherit the brand color on hover**: when it's off, the menu uses only its own colors from the Menu Builder.

The brand color is set in **Global colours** below (its **Primary** colour).

### Global colours

The site's palette: five built-in colours, **Primary** (the brand colour, used by buttons, links, the **Site** colour in the text editor and the **Glow (brand color)** hover effect), **Secondary**, **Accent**, **Text** and **Background**. Rename a colour, change it with the swatch or type a hex value (such as `#1e293b`), and add or delete your own colours with **Add colour** and the bin icon. The built-in colours can't be deleted.

Every colour field in the editor shows the palette as swatches, under **Global colours**. A field set to a global colour shows its name and follows the palette when you change it. **Unlink** keeps the colour it has now as a fixed colour.

### Text styles

Named text styles for the whole site: **Heading 1** to **Heading 6**, **Body**, **Small** and **Button**. For each one set the **Font**, **Size**, **Weight** and **Line height**. Leave a field empty to keep the browser's or the site's default for it.

- The **Tablet** and **Phone** buttons above the table set the sizes and spacing for those screens. A tablet or phone value you leave empty uses the desktop one.
- The headings, body text, small text and buttons of the site use these styles. A block uses one of them when you pick it in the **Style** tab, under **Typography › Text style**.
- Sizes are CSS lengths such as `2.5rem` or `18px`. Line height is a number such as `1.2`.

### Buttons & fields

- **Button presets**: **Primary**, **Secondary** and **Outline**. For each, set the **Background**, the **Text** colour, the **Border** (leave it empty for no border) and the **Corner radius** (such as `6px` or `999px`). A button that uses a preset (see [Button colors and hover](#button-colors-and-hover)) follows it when you change it here.
- **Form fields**: the **Background**, **Border** and **Corner radius** of the input boxes on your forms, wizards, newsletter sign-ups and site search. The text colour of the fields is not changed.

### Site identity & SEO

- **Site name**: set at installation. It's also shown on the sign-in screen, at the top of the sidebar and in the browser tab of the admin.
- **Site address (for sitemap, social and RSS)**: the full address of your site, for example `https://www.example.com`. The collections' RSS feeds are only made when it's filled in, and search engines use it to know the main address of each page.
- **Page title suffix**: added to every page title in the browser tab (for example " | My Site"). Leave it empty for none.
- **Favicon**: the small icon in the browser tab. Use a square image (PNG, SVG or ICO, at least 64×64). It's also used as the logo of the admin (sign-in screen, sidebar, browser tab).
- **Default social image (OG)**: used when a page has no social share image of its own. 1200×630 works best.

For both, type an address, click **Upload image** (it goes into the Media Library, with its progress on the button) or click **Library** to pick an image you've already uploaded. A small preview shows the image. Click **Save & Publish** to apply it.
- **Allow search engines to index the site (robots.txt)**.

To hide a single page from search engines, use **Hide this page from search engines** in that page's settings (see [Search engines and sharing](#search-engines-and-sharing-seo--meta-data)).

### Global header & footer

The header and footer are groups of blocks shown at the top and bottom of every page.

- **Enabled (shown on all pages)**: turns the header or footer on or off.
- **Edit header** / **Edit footer**: opens it in the editor, with a **Global header** or **Global footer** badge. Edit it like a page, then click **Save**. Click **Publish** to also put it online.
- **Delete**: removes all its blocks from every page and republishes the site. This can't be undone.

### Announcement bar

A message shown across the top of every page, for example an offer or a closing time.

1. Tick **Show the announcement bar on every page**.
2. Type the **Message**, and optionally an icon (one emoji), the **Link text (empty = no link)** and a link: pick a page, or type an address in **Link address**.
3. Choose the **Colors** and the **Alignment**.
4. Look at the **Preview** under the card.
5. Click **Save & Publish**.

Options: **Stay at the top while scrolling** keeps the bar visible as the visitor scrolls, and **Visitors can dismiss it** adds a close button. A dismissed bar stays hidden until you change its message. When the top menu is pinned, the bar sticks under it.

### Cookie banner

The cookie banner is a notice shown on every page of the site with an Accept and a Decline button. The visitor's choice is remembered, so the banner doesn't come back on every page.

1. Tick **Show the cookie banner**.
2. Optional: change the **Text**, the **Accept button** and **Decline button** labels, and the **Link text**. Empty fields use the text shown in grey.
3. Choose your **Privacy policy page**, or **— no link —**.
4. Choose a **Position**: **Bottom, centered**, **Bottom left** or **Bottom right**.
5. Click **Save & Publish**.

The banner by itself doesn't block anything. If your site loads tracking or marketing tools, an administrator can set them up so they start only after the visitor clicks Accept (see the [Administrator Guide](ADMIN-GUIDE.md)).

### Redirects (admins)

A redirect sends visitors from an old address to a new one. CanvasCore adds one automatically when you rename a published page or collection item (see [Deleted and renamed pages](#deleted-and-renamed-pages)). The **Redirects** card lists them all: **Old address**, **Goes to**, and whether each one is **automatic** or **added by hand**.

To add one yourself, for example for a page that was on your old website:

1. Type the **Old address** (for example `/old-page/`).
2. Type the **New address**: a page of the site (for example `/new-page/`) or a full web address.
3. Click **Add redirect**.

To remove one, click its bin icon and confirm with **Remove redirect**. Visitors using that old address will then get "page not found".

Redirects are put online, and removed, the next time the site is published.

### Form emails (admins)

- **Default receiving email (To)**: where form messages go when a form has no email of its own.
- **Sender email (From)** and **Default subject**.

### Security (admins)

- **Session timeout (minutes of inactivity)**: between 5 and 720. The default is 30.
- **Trusted proxy addresses**: fill this in only if your hosting company tells you the site sits behind a "reverse proxy" or a CDN. Type the proxy's IP addresses, separated by commas. The protection against repeated wrong passwords and against form spam then counts each visitor separately. Leave it empty otherwise.

Editors don't see the **Redirects**, **Form emails** and **Security** cards. They can still change everything else on this screen.

---

## 13. Administration (admins only)

These sections appear under **Administration** in the sidebar only for admins. Details are in the [Administrator Guide](ADMIN-GUIDE.md).

- **Forms**: the **Form** block's **Form Settings** set the **Form Title**, the **Receiving Email** and the **Submit Button Text**, and **Form Fields** lists the fields (for example **Short Text**, **Email**, **Long Text**, **Number**). See the [Block Reference](BLOCK-REFERENCE.md).
- **Submissions** (**Form Submissions**): messages visitors sent through your forms, including the **Multi-step Form** and **Newsletter Signup** blocks. You can search them, **Refresh** the list, **Export CSV**, delete single messages or **Clear all**.
- **Accounts**: **Add a user** with a **Username** (3–32 letters, digits, `.`, `_`, `-` or `@`; `Anna` and `anna` count as the same name), **Password** and **Role**. In the list you can **Change password** of another account (it is signed out at once and must choose a new password at the next sign-in; for your own, use the key icon) or delete an account. You can't delete your own account or the last admin.
- **Backup**: **Download backup (.zip)** saves the whole site in one file: pages and their drafts, collections and items, templates, masters, the global header and footer, redirects, Global Options, the menu and every uploaded image, audio and video file (with its description and folder). Version history and form messages are optional. User accounts and passwords are never included. **Keep a copy on the server** stores it on the server instead, where it can later be downloaded, restored or deleted. **Restore** (from a file, or from a copy on the server) **replaces** the whole site with the backup; user accounts are kept, a safety copy of the current site is saved first, and the site is published again afterwards. Older `.json` backups can still be imported.
- **Block packages**: **Choose a package (.zip)…** adds blocks made by other people; they appear in the Add tab under **Block packages** and work like any other block (Content, Style and Advanced tabs, copy, templates). The page lists what is installed, with an **On** switch (off: the blocks leave the Add tab and the published pages, but stay saved in your pages) and **Remove**, which first tells you how many pages use the package's blocks. A package cannot run code and is checked before it is installed, but install packages only from people you trust. Packages are not part of a backup: keep the `.zip` files.
- **Import from WordPress**: brings pages, posts, categories, tags and pictures over from a WordPress site. In WordPress choose **Tools › Export › All content** and keep the `.xml` file, then **Choose the export (.xml)…**: you see how much it holds (nothing changes yet), tick **Pages**, **Posts** (into a new collection or an existing one) and **Pictures**, and **Start the import**. Everything arrives as **drafts** (tick it off to import published entries as published, optionally forwarding the old addresses), so you can open each page and post, check it and publish when you are happy. Nothing you already have is changed or deleted. The report at the end lists what was left out or could not be copied (for example a contact-form shortcode or a picture that could not be downloaded). Menus are not imported: build yours in **Menu**.
- **Updates**: **Check for updates** looks for a newer CanvasCore release on GitHub and shows its version and release notes. **Update to …** downloads it, checks its signature, saves a backup (a safety copy of the content, the database and the code), installs it and checks that it starts; if any check fails, the previous version is put back and the page says why. Keep the page open while it works (about a minute), tell the other people in the editor to save first, then click **Reload the editor** and **Publish Site**. The page also lists what the server needs and the history of the updates. Details and what to do when an update is refused are in the [Administrator Guide](ADMIN-GUIDE.md#5-updating-to-a-new-version).

---

## 14. Good to know and troubleshooting

**My changes aren't on the live site.**
You probably saved a draft. Open the page and click **Publish**. In the page list, **Modified** means there are saved changes that aren't online yet. For archive changes, moved or deleted collection items, a renamed collection, a changed global master or new redirects, click **Publish Site**.

**An image is broken on the site.**
The image was probably deleted from the Media Library, or its address was typed wrongly. Upload it again and choose it again in the block. Moving an image to another folder never breaks it: folders don't change addresses.

**The sidebar or sign-in screen shows the default icon instead of my favicon.**
The favicon address in **Global Options** is empty, or the image can't be loaded (deleted, or a wrong address). Choose it again with **Upload image** or **Library** and click **Save & Publish**.

**Some collection items were "skipped" when moving them.**
The destination collection already has a published item with the same URL slug (or the item was already there). Change the slug of one of them, then move it again.

**I was signed out.**
Your session expired after inactivity. Sign in again on the **Session expired** screen to carry on where you were. If you had closed or reloaded the tab, sign in and use **Restore** in **Unsaved work found**.

**The editor shows "Unsaved changes found" or "Restored unsaved changes".**
CanvasCore found work on this device that was never saved to the site. Click **Restore** to keep working on it, then **Save Draft** or **Publish**. Click **Discard** if you don't need it.

**My unsaved work isn't offered on another computer.**
Backups of unsaved work are stored only in the browser where you made the changes.

**I can't publish: the URL is already used.**
Another page (or a collection) already has that address. Change the **URL (Slug)** in **Page Settings › Page Info**. The addresses `canvascore-admin`, `uploads`, `canvascore-data` and `data` belong to CanvasCore itself and can't be used, not even for a draft ("The URL /…/ is reserved for CanvasCore").

**Animations don't play in the editor.**
That's intentional, so blocks are easy to edit. Use **Preview animation** in the **Advanced** tab, or view the published page.

**I deleted a block by mistake.**
Press **Ctrl/Cmd+Z**, or click **Undo** in the top bar, before you leave the page. If you've already left the page or saved over it, open **Version history** in the editor and restore a version that still has the block.

**I want an earlier version of a page back.**
Open the page, click the clock icon (**Version history**), pick the version and click **Restore this version**. Then **Save Draft** or **Publish**. See [Version history](#7-version-history).

**Ctrl/Cmd+C, Ctrl/Cmd+V or Delete don't work on the block.**
These shortcuts work on the selected block only when you aren't typing. If the cursor is in a text or a field (for example after clicking a Text block on the canvas), the keys work on the text instead. Select the block by clicking its row in **Layers**, then press the shortcut, or use the quick action buttons under the settings panel header.

**The old address of a renamed page still shows the old page, or "page not found".**
The redirect from the old address goes online when the page is published. Open the page and click **Publish**, or click **Publish Site**. If the page was only saved as a draft, the old address doesn't change yet.

**The Site Search box doesn't find a new page or a new text.**
The search uses a list of pages that is rebuilt each time the site is published. Publish the page (or click **Publish Site**). Pages with **Hide this page from search engines** ticked are never found, and drafts aren't either. For the Site Search block itself, see the [Block Reference](BLOCK-REFERENCE.md).

**My collection has no RSS feed.**
A feed is only made when **Global Options › Site identity & SEO › Site address** is filled in and the collection has at least one published item. Fill in the address, then publish the site. The feed is at the collection's address followed by `feed.xml`.

**The "Optimize … older images" button is shown in Media.**
Some images were uploaded before CanvasCore started making phone-sized copies. Click the button once; then publish the site so pages use the smaller copies. If the button keeps coming back for the same images, the server can't make copies of them (for example a very large photo). Ask an administrator.

**For editors: pages with custom code.**
Custom HTML and custom CSS can only be changed by administrators. You can see a Custom HTML block's code, move the block or delete it, and saving the page as an editor keeps the administrator's code as it was. Ask an administrator if the code itself needs to change.

**"Editor v… / server v…" appears at the bottom of the sidebar.**
CanvasCore was updated while you had it open. Save your work, then reload the page.
