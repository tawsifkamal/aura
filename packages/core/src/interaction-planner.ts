import type { InferredRoute } from "./route-inferrer.js";

export type InteractionType =
  | "click"
  | "type"
  | "select"
  | "toggle"
  | "submit"
  | "hover"
  | "scroll"
  | "navigate";

export interface InteractiveElement {
  type: InteractionType;
  selector: string;
  description: string;
  sourceFile: string;
  confidence: "high" | "medium" | "low";
}

export interface InteractionStep {
  order: number;
  route: string;
  element: InteractiveElement;
  value?: string;
  waitAfterMs?: number;
  screenshotAfter: boolean;
}

export interface InteractionPlan {
  steps: InteractionStep[];
  summary: string;
  elementsFound: number;
  routesCovered: string[];
}

const INTERACTIVE_ELEMENT_PATTERNS: {
  pattern: RegExp;
  type: InteractionType;
  selectorHint: string;
}[] = [
  {
    pattern: /<button[\s>]/gi,
    type: "click",
    selectorHint: "button",
  },
  {
    pattern: /<input[\s>]/gi,
    type: "type",
    selectorHint: "input",
  },
  {
    pattern: /<textarea[\s>]/gi,
    type: "type",
    selectorHint: "textarea",
  },
  {
    pattern: /<select[\s>]/gi,
    type: "select",
    selectorHint: "select",
  },
  {
    pattern: /<form[\s>]/gi,
    type: "submit",
    selectorHint: "form",
  },
  {
    pattern: /<a[\s>]/gi,
    type: "click",
    selectorHint: "a",
  },
  {
    pattern: /type=["']checkbox["']/gi,
    type: "toggle",
    selectorHint: 'input[type="checkbox"]',
  },
  {
    pattern: /type=["']radio["']/gi,
    type: "toggle",
    selectorHint: 'input[type="radio"]',
  },
  {
    pattern: /role=["']button["']/gi,
    type: "click",
    selectorHint: '[role="button"]',
  },
  {
    pattern: /role=["']tab["']/gi,
    type: "click",
    selectorHint: '[role="tab"]',
  },
  {
    pattern: /role=["']switch["']/gi,
    type: "toggle",
    selectorHint: '[role="switch"]',
  },
];

const EVENT_HANDLER_PATTERNS: {
  pattern: RegExp;
  type: InteractionType;
}[] = [
  { pattern: /onClick/g, type: "click" },
  { pattern: /onSubmit/g, type: "submit" },
  { pattern: /onChange/g, type: "type" },
  { pattern: /onInput/g, type: "type" },
  { pattern: /onMouseEnter/g, type: "hover" },
  { pattern: /onToggle/g, type: "toggle" },
  { pattern: /onScroll/g, type: "scroll" },
];

interface DiffHunk {
  file: string;
  addedLines: string[];
}

function parseDiffHunks(diff: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  let currentFile = "";

  for (const line of diff.split("\n")) {
    if (line.startsWith("diff --git")) {
      const match = line.match(/b\/(.+)$/);
      if (match?.[1]) {
        currentFile = match[1];
      }
    } else if (line.startsWith("+") && !line.startsWith("+++")) {
      const content = line.slice(1);
      let hunk = hunks.find((h) => h.file === currentFile);
      if (!hunk) {
        hunk = { file: currentFile, addedLines: [] };
        hunks.push(hunk);
      }
      hunk.addedLines.push(content);
    }
  }

  return hunks;
}

function extractSelector(line: string, hint: string): string {
  // Try to extract id
  const idMatch = line.match(/id=["']([^"']+)["']/);
  if (idMatch?.[1]) return `#${idMatch[1]}`;

  // Try to extract data-testid
  const testIdMatch = line.match(/data-testid=["']([^"']+)["']/);
  if (testIdMatch?.[1]) return `[data-testid="${testIdMatch[1]}"]`;

  // Try to extract aria-label
  const ariaMatch = line.match(/aria-label=["']([^"']+)["']/);
  if (ariaMatch?.[1]) return `[aria-label="${ariaMatch[1]}"]`;

  // Try to extract className for specificity
  const classMatch = line.match(/className=["']([^"']+)["']/);
  if (classMatch?.[1]) {
    const firstClass = classMatch[1].split(/\s+/)[0];
    if (firstClass) return `${hint}.${firstClass}`;
  }

  // Try to extract text content for buttons/links
  const textMatch = line.match(/>([^<]{1,30})</);
  if (textMatch?.[1]) {
    const text = textMatch[1].trim();
    if (text) return `${hint}:has-text("${text}")`;
  }

  return hint;
}

function describeElement(type: InteractionType, selector: string): string {
  switch (type) {
    case "click":
      return `Click on ${selector}`;
    case "type":
      return `Type into ${selector}`;
    case "select":
      return `Select option in ${selector}`;
    case "toggle":
      return `Toggle ${selector}`;
    case "submit":
      return `Submit ${selector}`;
    case "hover":
      return `Hover over ${selector}`;
    case "scroll":
      return `Scroll ${selector}`;
    case "navigate":
      return `Navigate to ${selector}`;
  }
}

export function extractInteractiveElements(
  diff: string
): InteractiveElement[] {
  const hunks = parseDiffHunks(diff);
  const elements: InteractiveElement[] = [];

  for (const hunk of hunks) {
    const addedContent = hunk.addedLines.join("\n");

    // Check for HTML/JSX interactive elements
    for (const { pattern, type, selectorHint } of INTERACTIVE_ELEMENT_PATTERNS) {
      // Reset regex lastIndex for global patterns
      pattern.lastIndex = 0;
      if (pattern.test(addedContent)) {
        for (const line of hunk.addedLines) {
          pattern.lastIndex = 0;
          if (pattern.test(line)) {
            const selector = extractSelector(line, selectorHint);
            elements.push({
              type,
              selector,
              description: describeElement(type, selector),
              sourceFile: hunk.file,
              confidence: selector !== selectorHint ? "high" : "medium",
            });
          }
        }
      }
    }

    // Check for event handlers (indicates interactivity even without HTML elements)
    for (const { pattern, type } of EVENT_HANDLER_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(addedContent)) {
        // Find the component/element context
        const existing = elements.find(
          (e) => e.sourceFile === hunk.file && e.type === type
        );
        if (!existing) {
          elements.push({
            type,
            selector: `[${type} handler in ${hunk.file}]`,
            description: `Interact with ${type} handler added in ${hunk.file}`,
            sourceFile: hunk.file,
            confidence: "low",
          });
        }
      }
    }
  }

  return elements;
}

function mapElementToRoute(
  element: InteractiveElement,
  routes: InferredRoute[]
): string {
  // Try to match the element's source file to a route
  for (const route of routes) {
    if (element.sourceFile === route.source) {
      return route.route;
    }
  }

  // Try partial path match
  for (const route of routes) {
    const routeDir = route.source.split("/").slice(0, -1).join("/");
    if (element.sourceFile.startsWith(routeDir)) {
      return route.route;
    }
  }

  // Default to root if no match
  return routes[0]?.route ?? "/";
}

export function generateInteractionPlan(
  diff: string,
  routes: InferredRoute[]
): InteractionPlan {
  const elements = extractInteractiveElements(diff);

  // Deduplicate by selector within same file
  const seen = new Set<string>();
  const uniqueElements = elements.filter((e) => {
    const key = `${e.sourceFile}:${e.selector}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Sort: high confidence first, then by type priority
  const typePriority: Record<InteractionType, number> = {
    navigate: 0,
    click: 1,
    type: 2,
    select: 3,
    toggle: 4,
    submit: 5,
    hover: 6,
    scroll: 7,
  };
  const confPriority = { high: 0, medium: 1, low: 2 };

  uniqueElements.sort((a, b) => {
    const confDiff = confPriority[a.confidence] - confPriority[b.confidence];
    if (confDiff !== 0) return confDiff;
    return typePriority[a.type] - typePriority[b.type];
  });

  const routesCovered = new Set<string>();
  const steps: InteractionStep[] = uniqueElements.map((element, i) => {
    const route = mapElementToRoute(element, routes);
    routesCovered.add(route);
    return {
      order: i + 1,
      route,
      element,
      waitAfterMs: element.type === "submit" ? 2000 : 500,
      screenshotAfter: true,
    };
  });

  const summary = [
    `Found ${String(uniqueElements.length)} interactive element(s) across ${String(routesCovered.size)} route(s).`,
    uniqueElements.length > 0
      ? `Actions: ${[...new Set(uniqueElements.map((e) => e.type))].join(", ")}.`
      : "No interactive changes detected — will capture screenshots only.",
  ].join(" ");

  return {
    steps,
    summary,
    elementsFound: uniqueElements.length,
    routesCovered: [...routesCovered],
  };
}
