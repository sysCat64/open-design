// Lovart-style centered hero for the entry Home view.
//
// The prompt textarea is the canonical creation surface: the user
// either types freely or selects a plugin below to load an example
// query, then presses Run / Enter to spawn a project. The hero is
// kept dependency-free (no plugin list / project list) so it can be
// composed with the recent-projects strip and plugins section
// without owning their data lifecycles.

import { forwardRef } from 'react';
import { Icon } from './Icon';

export interface HomeHeroSubmitHandler {
  (): void;
}

interface Props {
  prompt: string;
  onPromptChange: (value: string) => void;
  onSubmit: HomeHeroSubmitHandler;
  activePluginTitle: string | null;
  onClearActivePlugin: () => void;
  contextItemCount: number;
  error: string | null;
}

export const HomeHero = forwardRef<HTMLTextAreaElement, Props>(function HomeHero(
  {
    prompt,
    onPromptChange,
    onSubmit,
    activePluginTitle,
    onClearActivePlugin,
    contextItemCount,
    error,
  },
  ref,
) {
  const canSubmit = prompt.trim().length > 0;
  const placeholder = activePluginTitle
    ? 'Edit the example query or write your own…'
    : 'What do you want to design? Type a prompt, or pick a plugin below…';

  return (
    <section className="home-hero" data-testid="home-hero">
      <div className="home-hero__brand" aria-hidden>
        <span className="home-hero__brand-mark">
          <img src="/app-icon.svg" alt="" draggable={false} />
        </span>
        <span className="home-hero__brand-name">Open Design</span>
      </div>
      <h1 className="home-hero__title">What do you want to design?</h1>
      <p className="home-hero__subtitle">
        Pick a plugin below to load an example query, or just type freely
        and press <kbd>Enter</kbd>.
      </p>

      <div className="home-hero__input-card">
        {activePluginTitle ? (
          <div className="home-hero__active" data-testid="home-hero-active-plugin">
            <span className="home-hero__active-chip">
              <span className="home-hero__active-dot" aria-hidden />
              <span>Plugin: {activePluginTitle}</span>
              <button
                type="button"
                className="home-hero__active-clear"
                onClick={onClearActivePlugin}
                aria-label="Clear active plugin"
                title="Clear active plugin"
              >
                ×
              </button>
            </span>
            {contextItemCount > 0 ? (
              <span className="home-hero__context-summary">
                {contextItemCount} context items resolved
              </span>
            ) : null}
          </div>
        ) : null}
        <textarea
          ref={ref}
          className="home-hero__input"
          data-testid="home-hero-input"
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          onKeyDown={(e) => {
            if (
              e.key === 'Enter' &&
              !e.shiftKey &&
              !e.metaKey &&
              !e.ctrlKey &&
              !e.altKey
            ) {
              e.preventDefault();
              if (canSubmit) onSubmit();
            }
          }}
          placeholder={placeholder}
          rows={3}
        />
        <div className="home-hero__input-foot">
          <span className="home-hero__hint">
            <kbd>↵</kbd> to run · <kbd>Shift</kbd>+<kbd>↵</kbd> for new line
          </span>
          <button
            type="button"
            className="home-hero__submit"
            data-testid="home-hero-submit"
            onClick={onSubmit}
            disabled={!canSubmit}
            title={canSubmit ? 'Run' : 'Type something to run'}
            aria-label="Run"
          >
            <Icon name="arrow-up" size={14} />
          </button>
        </div>
      </div>

      {error ? (
        <div role="alert" className="home-hero__error">
          {error}
        </div>
      ) : null}
    </section>
  );
});
