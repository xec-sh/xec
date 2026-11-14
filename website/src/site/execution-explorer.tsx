import React, { useState } from 'react';
import { useCopyToClipboard } from '@omnitron-dev/prism/core';
import { Tab, Box, Tabs, Button } from '@omnitron-dev/prism/ui';

export interface Example {
  id: string;
  label: string;
  file: string;
  code: string;
  note: string;
  href: string;
  html: string;
}
export function ExecutionExplorer({ examples }: { examples: Example[] }) {
  const [selected, setSelected] = useState(0);
  const { copy, reset, state } = useCopyToClipboard();
  const current = examples[selected];
  return (
    <Box className="execution-explorer">
      <div className="explorer-bar">
        <span className="terminal-prompt" aria-hidden="true">
          ❯
        </span>
        <span>One toolkit. Your environment.</span>
        <span className="explorer-status">TYPESCRIPT</span>
      </div>
      <Tabs
        value={selected}
        onChange={(_event, value: number) => {
          setSelected(value);
          reset();
        }}
        variant="scrollable"
        scrollButtons="auto"
        aria-label="Execution examples"
      >
        {examples.map((example, index) => (
          <Tab
            key={example.id}
            id={`example-tab-${example.id}`}
            aria-controls={`example-panel-${example.id}`}
            label={example.label}
            value={index}
          />
        ))}
      </Tabs>
      <section
        id={`example-panel-${current.id}`}
        role="tabpanel"
        aria-labelledby={`example-tab-${current.id}`}
        tabIndex={0}
      >
        <div className="example-file">
          <span>{current.file}</span>
          <Button
            size="small"
            onClick={() => {
              void copy(current.code);
            }}
            aria-label="Copy example"
          >
            {state === 'success' ? 'Copied' : 'Copy'}
          </Button>
        </div>
        <div className="example-code" dangerouslySetInnerHTML={{ __html: current.html }} />
        <div className="example-note">
          <p>{current.note}</p>
          <a href={current.href}>Read the guide ↗</a>
        </div>
        {state === 'success' && (
          <span className="visually-hidden" role="status">
            Example copied
          </span>
        )}
        {state === 'error' && <p role="alert">Clipboard unavailable. Select the example to copy it.</p>}
      </section>
    </Box>
  );
}
