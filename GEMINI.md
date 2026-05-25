# Wikipedia Glasses Guidelines (GEMINI.md)

This project is a Wikipedia client optimized for smart glasses displays, utilizing simple D-pad navigation and local storage cache.

## Build and Dev Commands

This project uses **Bun** as the package manager and runner, and **Vite** as the build tool.

- **Start Dev Server**: `bun run dev` (Runs Vite locally)
- **Production Build**: `bun run build` (Outputs the compiled asset bundle to the `docs/` directory)
- **Preview Build**: `bun run preview`

## Tech Stack & Architecture

- **Core**: Vanilla HTML5 structure and JavaScript following the latest ES features supported by the build tools (Vite).
- **Styling**: Vanilla CSS with design tokens defined in `:root`. Tailored for a **600x600** additive dark display (pure black background `#000000` is transparent on smart glasses).
- **Vite Configuration**: The project is built using **Vite**. Code and assets reside in `src/` and are built into `docs/` for GitHub Pages hosting compatibility.

## Coding Standards

1. **JavaScript Style**: Follow the latest supported ES features (e.g. `const`, `let`, arrow functions, modules, classes) supported by the underlying Vite build tools.
2. **D-Pad Focus Management**:
   - Any interactive element must have the `.focusable` class and `tabindex` if appropriate.
   - Elements must transition smoothly on `:focus` with a visible outline or focus glow (`var(--focus-ring)` / `var(--focus-glow)`).
3. **Responsive Design**: Maintain fixed `600px` by `600px` layout proportions and prevent document scrolling using `overflow: hidden` on the body.

## Navigation & Routing Rules

1. **State-based Navigation**: Transition between screens using `navigateTo(screenId, options)` and `navigateBack()`.
2. **History Preservation**:
   - Keep a history of states in `state.screenHistory` containing object states rather than simple screen ID strings.
   - For `'detail'` screens, preserve `article` summary objects.
   - For `'search'` screens, preserve the `query` text and results `resultsHtml`.
3. **Contextual Back Navigation**:
   - Back actions (button click or Escape key) should traverse the page history.
   - **Escape Key on Article Page**: First press of Escape on the detail screen must shift focus to the Back button. A subsequent press of Escape on the Back button executes the back navigation action.
4. **2D Focus Layouts**:
   - **Detail Screen**:
     - *Header Row*: `Back` (0) <-> `Home` (1) <-> `Save` (2) (Left/Right moves horizontally).
     - *Vertical Transition*: Pressing **Down** from any header button jumps straight to the page scroll container (bypassing other header buttons).
     - *Upward Transition*: Pressing **Up** from the top of the scroll container shifts focus back to the `Back` button.
