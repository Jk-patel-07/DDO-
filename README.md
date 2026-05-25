# DDO

DDO is a React + Vite desktop-style UI experiment that recreates a polished macOS-inspired status bar with interactive utilities. The app currently focuses on a floating top bar, an AI-style search field, a live clock popup, and a WhatsApp quick-message workflow with locally saved contacts.

## What the app currently does

### Status bar
- Renders a fixed glassmorphism bar at the top of the screen.
- Auto-hides when the pointer leaves the top area.
- Reappears when the cursor returns near the top edge.
- Stays visible while an input is focused so the search field does not disappear mid-typing.

### Left menu
- Shows a macOS-style Apple icon area.
- Includes simple desktop menu labels: `File`, `Edit`, `View`, `Window`, and `Help`.

### Center search
- Displays a spotlight-like search field with `Search` and `Sparkles` icons.
- Opens a suggestion panel when focused.
- Shows quick prompt suggestions for:
  - `Ask ChatGPT`
  - `Ask Gemini`
- Updates the suggestion text live as the user types.

### Right tray
- Shows quick-access icons for:
  - WhatsApp
  - Facebook
  - Wi-Fi
  - Bluetooth
  - Battery
  - Notifications
  - User avatar
- Displays a live clock in the menu bar.
- Opens a time popup with the full current time and formatted date.

### WhatsApp quick message flow
- Opens a WhatsApp utility popup from the tray.
- Lets the user switch into a `Send Message` flow.
- Supports choosing a saved contact from a dropdown.
- Supports typing a custom WhatsApp message.
- Opens the WhatsApp send URL using `https://wa.me/...`.

### Contact management
- Lets the user create contacts inside the WhatsApp flow.
- Saves contacts in browser `localStorage` under `waContacts`.
- Saves recent phone usage history in browser `localStorage` under `waPhoneHistory`.
- Includes UI for:
  - add contact
  - select contact
  - delete contact
  - inspect contact details
- Contact details modal currently supports placeholders for fields like email, work, and groups if they are not present.

## Tech stack

- React 19
- Vite 8
- `lucide-react` for most icons
- `react-icons` for WhatsApp and Facebook icons
- Plain CSS in `src/index.css`

## Project structure

```text
src/
  App.jsx
  main.jsx
  index.css
  components/
    StatusBar.jsx
    LeftMenu.jsx
    CenterSearch.jsx
    RightTray.jsx
public/
  favicon.svg
  icons.svg
```

## Component overview

### `src/App.jsx`
- Mounts the top status bar UI.

### `src/components/StatusBar.jsx`
- Controls top-bar visibility with mouse movement detection.
- Composes the layout from `LeftMenu`, `CenterSearch`, and `RightTray`.

### `src/components/LeftMenu.jsx`
- Renders the Apple icon and desktop menu labels.

### `src/components/CenterSearch.jsx`
- Manages search input state.
- Shows a floating suggestion dropdown while focused.

### `src/components/RightTray.jsx`
- Handles:
  - live time updates
  - time popup open/close behavior
  - WhatsApp popup state
  - contact add/select/detail flows
  - localStorage persistence for contacts and history
  - external WhatsApp redirect

### `src/index.css`
- Defines the glassmorphism theme, global layout, hover states, and animations.
- Applies a full-screen wallpaper background.

## Getting started

### Prerequisites
- Node.js 18+ recommended
- npm

### Install

```bash
npm install
```

### Start development server

```bash
npm run dev
```

### Build for production

```bash
npm run build
```

### Preview production build

```bash
npm run preview
```

## Current behavior notes

- The app uses browser `localStorage`, so contacts are stored per browser/profile.
- The WhatsApp send action redirects the current page to WhatsApp using `window.location.href`.
- The background image and some icons are loaded from remote URLs.
- `App.jsx` currently mounts only the status bar, so the rest of the screen is intentionally decorative for now.

## Known limitations

- There is no backend or database.
- Contact validation is minimal.
- Some contact fields shown in the details modal are placeholders unless extra data is added manually.
- The search suggestions are visual only and do not yet trigger real ChatGPT or Gemini integrations.
- The UI is heavily implemented with inline styles inside `RightTray.jsx`, so future maintenance would benefit from refactoring into smaller components and shared CSS classes.

## Suggested next improvements

- Break `RightTray.jsx` into smaller reusable components.
- Add real open-in-new-tab behavior for ChatGPT and Gemini search actions.
- Add proper contact editing with field deduplication.
- Improve form validation for phone numbers.
- Replace remote assets with local project assets.
- Make the interface fully responsive on smaller screens.
- Add tests for contact persistence and popup interactions.

## Scripts

- `npm run dev` starts the Vite dev server.
- `npm run build` creates a production build.
- `npm run preview` previews the production build locally.
- `npm run lint` runs ESLint.
