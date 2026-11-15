import React, { useState } from 'react';
import { Drawer } from '@omnitron-dev/prism/components';
import { Button, IconButton } from '@omnitron-dev/prism/ui';
import { MenuIcon, CloseIcon } from '@omnitron-dev/prism/icons';
import { DocSidebar, type DocSidebarItem } from '@omnitron-dev/prism/components/doc-layout';

export const mainItems: DocSidebarItem[] = [
  ['Learn', '/docs/introduction'], ['Build a CLI', '/docs/commands/overview'],
  ['Orchestrate', '/docs/ops'], ['Terminal UI', '/docs/kit'], ['Reference', '/docs/commands/cli-reference'],
].map(([label, href]) => ({ id: href!, label: label!, href }));

export function MainNavigation({ currentPath }: { currentPath?: string }) {
  return <nav aria-label="Main navigation" className="main-navigation">
    {mainItems.map(item => <Button key={item.id} href={item.href} variant="text" color="inherit" size="small"
      aria-current={currentPath === item.href ? 'page' : undefined}>{item.label}</Button>)}
  </nav>;
}

export function MobileNavigation({ items, activeId, title, label, iconOnly = false, disabled = false }: {
  items: DocSidebarItem[]; activeId?: string; title: string; label: string; iconOnly?: boolean; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const trigger = { type: 'button' as const, 'aria-label': label, 'aria-haspopup': 'dialog' as const,
    'aria-expanded': open, disabled, onClick: () => setOpen(true) };
  return <>
    {iconOnly ? <IconButton {...trigger}><MenuIcon /></IconButton> : <Button {...trigger} variant="text" startIcon={<MenuIcon />}>{label}</Button>}
    <Drawer open={open} onClose={() => setOpen(false)} title={title} closeIcon={<CloseIcon />}
      anchor="left" width="min(360px, 100vw)" PaperProps={{ role: 'dialog', 'aria-label': title, 'aria-modal': true }}>
      <nav aria-label={title}><DocSidebar items={items} activeId={activeId} /></nav>
    </Drawer>
  </>;
}
