import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { cn } from '../src/lib/cn.js';
import { Avatar, AvatarFallback } from '../src/ui/avatar.js';
import { Badge } from '../src/ui/badge.js';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
} from '../src/ui/breadcrumb.js';
import { Button } from '../src/ui/button.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../src/ui/card.js';
import { Input } from '../src/ui/input.js';
import { Separator } from '../src/ui/separator.js';
import { Skeleton } from '../src/ui/skeleton.js';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../src/ui/table.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../src/ui/tabs.js';
import { Textarea } from '../src/ui/textarea.js';

describe('cn', () => {
  it("lets a caller's class beat the component default", () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });

  it('drops falsy values', () => {
    expect(cn('a', false, undefined, null, 'b')).toBe('a b');
  });
});

describe('primitives', () => {
  it('renders a button with its variant and size on the element', () => {
    render(
      <Button variant="outline" size="sm">
        Save
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button.getAttribute('data-slot')).toBe('button');
    expect(button.className).toContain('border-border');
  });

  it('renders a badge as a span by default', () => {
    render(<Badge variant="success">live</Badge>);
    expect(screen.getByText('live').tagName).toBe('SPAN');
  });

  it('renders a card with its header parts', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Pipeline</CardTitle>
          <CardDescription>this quarter</CardDescription>
        </CardHeader>
        <CardContent>42</CardContent>
      </Card>,
    );
    expect(screen.getByText('Pipeline')).toBeDefined();
    expect(screen.getByText('this quarter')).toBeDefined();
    expect(screen.getByText('42')).toBeDefined();
  });

  it('renders form controls that accept a value', () => {
    render(
      <>
        <Input defaultValue="hello" aria-label="name" />
        <Textarea defaultValue="lines" aria-label="notes" />
      </>,
    );
    expect(screen.getByLabelText('name')).toHaveProperty('value', 'hello');
    expect(screen.getByLabelText('notes')).toHaveProperty('value', 'lines');
  });

  it('renders a table with head and body cells', () => {
    render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Client</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Acme</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    expect(screen.getByRole('columnheader', { name: 'Client' })).toBeDefined();
    expect(screen.getByRole('cell', { name: 'Acme' })).toBeDefined();
  });

  it('wraps a table in its own horizontal scroller, so the page never scrolls sideways', () => {
    const { container } = render(<Table />);
    const wrapper = container.querySelector('[data-slot="table-container"]');
    expect(wrapper?.className).toContain('overflow-x-auto');
  });

  it('renders tabs and shows the selected panel', () => {
    render(
      <Tabs defaultValue="one">
        <TabsList>
          <TabsTrigger value="one">One</TabsTrigger>
          <TabsTrigger value="two">Two</TabsTrigger>
        </TabsList>
        <TabsContent value="one">first panel</TabsContent>
      </Tabs>,
    );
    expect(screen.getByRole('tab', { name: 'One' })).toBeDefined();
    expect(screen.getByText('first panel')).toBeDefined();
  });

  it('renders a breadcrumb trail ending in the current page', () => {
    render(
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/leads">Leads</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbItem>
            <BreadcrumbPage>Acme</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>,
    );
    expect(screen.getByRole('navigation', { name: 'breadcrumb' })).toBeDefined();
    expect(screen.getByText('Acme').getAttribute('aria-current')).toBe('page');
  });

  it('renders an avatar fallback when there is no image', () => {
    render(
      <Avatar>
        <AvatarFallback>DA</AvatarFallback>
      </Avatar>,
    );
    expect(screen.getByText('DA')).toBeDefined();
  });

  it('renders a separator with an orientation', () => {
    const { container } = render(<Separator orientation="vertical" />);
    expect(
      container.querySelector('[data-slot="separator"]')?.getAttribute('data-orientation'),
    ).toBe('vertical');
  });

  it('renders a skeleton', () => {
    const { container } = render(<Skeleton className="h-4 w-20" />);
    expect(container.querySelector('[data-slot="skeleton"]')).not.toBeNull();
  });
});
