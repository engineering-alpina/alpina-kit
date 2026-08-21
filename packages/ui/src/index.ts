/**
 * `@alpina/ui` — the flat Alpina look, once.
 *
 * Three things ship here and nothing else does.
 *
 * 1. **Tokens.** `@alpina/ui/tokens.css` is the canon in
 *    `@alpina/contracts/DESIGN-SYSTEM.md` expressed as CSS: oklch neutrals,
 *    `#3c49ec`, 2px everywhere, no shadows, Geist. It is not imported from here;
 *    a consumer's stylesheet imports it directly.
 * 2. **The shell.** Sidebar plus topbar, with the ERP module block rendered from
 *    the registry rather than from a list somebody has to remember to update.
 * 3. **Primitives.** The shadcn-style components on `@base-ui/react` that
 *    upwork-crm had vendored, minus the ones that only made sense there.
 *
 * The rules from CLAUDE.md that bite hardest in a UI package: no business logic
 * (the shell takes an app's sections as props and never names a route itself),
 * and no session behaviour (the app decides whether a shell renders at all).
 */

export { cn } from './lib/cn.js';
export { useIsMobile, MOBILE_BREAKPOINT } from './lib/use-mobile.js';

export { AppShell, ShellTopbar, type AppShellProps, type ShellBrand } from './shell/app-shell.js';
export { ModuleSwitcher, serviceIcon, type ModuleSwitcherProps } from './shell/module-switcher.js';
/**
 * The module list itself is data, not UI, so it lives in `@alpina/contracts`
 * where a consumer without React can read it. Re-exported here because these
 * names shipped from `@alpina/ui` in v0.1.0 and an import that already works
 * should keep working.
 */
export {
  moduleServices,
  serviceIconName,
  NON_MODULE_SERVICE_IDS,
  SERVICE_ICON_NAMES,
  FALLBACK_SERVICE_ICON_NAME,
  type ModuleServicesOptions,
} from '@alpina/contracts';
export { isActive, type NavGroup, type NavItem, type LinkRenderer } from './shell/nav.js';

export {
  Avatar,
  AvatarImage,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarBadge,
} from './ui/avatar.js';
export { Badge, badgeVariants } from './ui/badge.js';
export {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
  BreadcrumbEllipsis,
} from './ui/breadcrumb.js';
export { Button, buttonVariants } from './ui/button.js';
export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
} from './ui/card.js';
export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog.js';
export { Input } from './ui/input.js';
export { Separator } from './ui/separator.js';
export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
} from './ui/sheet.js';
export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from './ui/sidebar.js';
export { Skeleton } from './ui/skeleton.js';
export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
} from './ui/table.js';
export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants } from './ui/tabs.js';
export { Textarea } from './ui/textarea.js';
export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from './ui/tooltip.js';
