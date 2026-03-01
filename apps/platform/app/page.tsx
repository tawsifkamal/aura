"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import styles from "./page.module.css";

/* ── Scroll-reveal hook ── */
function useScrollReveal() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add(styles.revealed ?? "");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return ref;
}

/* ── Animated counter ── */
function AnimatedCounter({ target, suffix = "" }: { target: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting && !hasAnimated.current) {
            hasAnimated.current = true;
            let start = 0;
            const duration = 1800;
            const startTime = performance.now();
            const step = (now: number) => {
              const progress = Math.min((now - startTime) / duration, 1);
              const eased = 1 - Math.pow(1 - progress, 4);
              start = Math.round(eased * target);
              el.textContent = `${String(start)}${suffix}`;
              if (progress < 1) requestAnimationFrame(step);
            };
            requestAnimationFrame(step);
          }
        });
      },
      { threshold: 0.5 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [target, suffix]);

  return <span ref={ref} className={styles.counter}>0{suffix}</span>;
}

/* ── Main landing page ── */
export default function LandingPage() {
  const navRef = useRef<HTMLElement>(null);

  /* Nav scroll effect */
  useEffect(() => {
    const handle = () => {
      if (navRef.current) {
        if (window.scrollY > 40) {
          navRef.current.classList.add(styles.navScrolled ?? "");
        } else {
          navRef.current.classList.remove(styles.navScrolled ?? "");
        }
      }
    };
    window.addEventListener("scroll", handle, { passive: true });
    return () => window.removeEventListener("scroll", handle);
  }, []);

  /* Scroll reveal refs */
  const demoRef = useScrollReveal();
  const featRef = useScrollReveal();
  const statsRef = useScrollReveal();
  const useCasesRef = useScrollReveal();
  const codeRef = useScrollReveal();
  const ctaRef = useScrollReveal();

  const smoothScroll = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className={styles.page}>
      {/* Noise overlay for texture */}
      <div className={styles.noiseOverlay} />

      {/* ── Nav ── */}
      <nav ref={navRef} className={styles.nav}>
        <div className={styles.navLogo}>Glimpse</div>
        <div className={styles.navLinks}>
          <span className={styles.navLink} onClick={() => smoothScroll("features")}>Features</span>
          <span className={styles.navLink} onClick={() => smoothScroll("use-cases")}>Use cases</span>
          <Link href="/dashboard" className={styles.navCta}>Dashboard</Link>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className={styles.hero}>
        <div className={styles.heroGrid} />
        <div className={styles.heroOrb} />

        <div className={styles.heroBadge}>
          <span className={styles.heroBadgeDot} />
          Made w Love for YC Browser Use Hackathon 2026
        </div>

        <h1 className={styles.heroTitle}>
          <span className={styles.heroTitleLine}>
            <span className={styles.heroTitleInner}>
              Demo videos,
            </span>
          </span>
          <span className={styles.heroTitleLine}>
            <span className={styles.heroTitleInner}>
              <span className={styles.heroAccent}>automated.</span>
            </span>
          </span>
        </h1>

        <p className={styles.heroSub}>
          Glimpse watches your pull requests, navigates your app like a real user,
          and generates cinematic Screen Studio-style demo videos. Automatically.
        </p>

        <div className={styles.heroCtas}>
          <Link href="/dashboard" className={styles.ctaPrimary}>
            Open Dashboard
            <span>&rarr;</span>
          </Link>
          <button className={styles.ctaSecondary} onClick={() => smoothScroll("features")}>
            See how it works
          </button>
        </div>

        <div className={styles.scrollIndicator}>
          <div className={styles.scrollLine} />
          <span className={styles.scrollText}>Scroll</span>
        </div>
      </section>

      {/* ── Demo preview ── */}
      <div ref={demoRef} className={`${styles.demoSection} ${styles.reveal}`}>
        <div className={styles.demoWrapper}>
          <span className={styles.demoLabelLeft}>Preview</span>
          <span className={styles.demoLabelRight}>Live</span>
          <div className={styles.demoFrame}>
            <div className={styles.demoTopBar}>
              <div className={styles.demoDot} />
              <div className={styles.demoDot} />
              <div className={styles.demoDot} />
              <div className={styles.demoUrlBar}>github.com/acme/app/pull/142</div>
            </div>
            <div className={styles.demoContent}>
              {/* PR View Layer */}
              <div className={styles.prLayer}>
                <div className={styles.prHead}>
                  <span className={styles.prBadge}>Open</span>
                  <span className={styles.prTitle}>Add user dashboard and settings</span>
                </div>
                <div className={styles.prBranches}>
                  <span className={styles.prBranch}>feat/dashboard</span>
                  <span className={styles.prInto}>&larr;</span>
                  <span className={styles.prBranch}>main</span>
                </div>
                <div className={styles.prSep} />
                <div className={styles.prComment}>
                  <div className={styles.prAvatar}>A</div>
                  <div className={styles.prCBody}>
                    <div className={styles.prCMeta}>
                      <span className={styles.prCName}>glimpse-bot</span>
                      <span className={styles.prCTag}>bot</span>
                      <span className={styles.prCTime}>2m ago</span>
                    </div>
                    <div className={styles.prCText}>Demo video for 2 changed routes:</div>
                    <div className={styles.prThumb}>
                      <div className={styles.prThumbPreview}>
                        <div className={styles.miniSb} />
                        <div className={styles.miniMn}>
                          <div className={styles.miniTb} />
                          <div className={styles.miniCds}>
                            <div className={styles.miniCd} />
                            <div className={styles.miniCd} />
                            <div className={styles.miniCd} />
                          </div>
                          <div className={styles.miniRws}>
                            <div className={styles.miniRw} />
                            <div className={styles.miniRw} />
                          </div>
                        </div>
                      </div>
                      <div className={styles.prPlayOverlay}>
                        <div className={styles.prPlayIcon}>&#9654;</div>
                      </div>
                      <span className={styles.prDur}>0:34</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Fullscreen Video Layer */}
              <div className={styles.videoLayer}>
                <div className={styles.mockApp}>
                  <div className={styles.mockSidebar}>
                    <div className={styles.mockLogo} />
                    <div className={styles.mockNavList}>
                      <div className={styles.mockNavItem} />
                      <div className={`${styles.mockNavItem} ${styles.mockNavActive}`} />
                      <div className={styles.mockNavItem} />
                      <div className={styles.mockNavItem} />
                    </div>
                  </div>
                  <div className={styles.mockMain}>
                    <div className={styles.mockTopbar}>
                      <div className={styles.mockTopTitle} />
                      <div className={styles.mockTopBtn} />
                    </div>
                    <div className={styles.mockBody}>
                      <div className={styles.mockCards}>
                        <div className={styles.mockCard}>
                          <div className={styles.mockCardVal} />
                          <div className={styles.mockCardLbl} />
                        </div>
                        <div className={styles.mockCard}>
                          <div className={styles.mockCardVal} />
                          <div className={styles.mockCardLbl} />
                        </div>
                        <div className={styles.mockCard}>
                          <div className={styles.mockCardVal} />
                          <div className={styles.mockCardLbl} />
                        </div>
                      </div>
                      <div className={styles.mockTable}>
                        <div className={styles.mockTableHd} />
                        <div className={styles.mockTableRw} />
                        <div className={styles.mockTableRw} />
                        <div className={styles.mockTableRw} />
                      </div>
                    </div>
                  </div>
                </div>
                {/* Click ripple effects */}
                <div className={`${styles.clickRipple} ${styles.ripple1}`} />
                <div className={`${styles.clickRipple} ${styles.ripple2}`} />
                <div className={`${styles.clickRipple} ${styles.ripple3}`} />
                <div className={`${styles.clickRipple} ${styles.ripple4}`} />
              </div>

              {/* Animated cursor */}
              <div className={styles.animCursor} />
            </div>
          </div>
        </div>
      </div>

      {/* ── Ticker ── */}
      <div className={styles.tickerSection}>
        <div className={styles.ticker}>
          {[...Array(2)].map((_, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center" }}>
              <span className={styles.tickerItem}>Record</span>
              <span className={styles.tickerDot}>&bull;</span>
              <span className={styles.tickerItem}>Analyze</span>
              <span className={styles.tickerDot}>&bull;</span>
              <span className={styles.tickerItem}>Render</span>
              <span className={styles.tickerDot}>&bull;</span>
              <span className={styles.tickerItem}>Deliver</span>
              <span className={styles.tickerDot}>&bull;</span>
              <span className={styles.tickerItem}>Edit</span>
              <span className={styles.tickerDot}>&bull;</span>
              <span className={styles.tickerItem}>Share</span>
              <span className={styles.tickerDot}>&bull;</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Features — 3-step pipeline ── */}
      <section id="features" ref={featRef} className={`${styles.featuresSection} ${styles.reveal}`}>
        <div className={styles.sectionLabel}>How it works</div>
        <h2 className={styles.sectionTitle}>
          Everything you need, nothing you don&#39;t
        </h2>

        <div className={styles.stepsRow}>
          {/* Step 1 — Open a PR */}
          <div className={styles.stepCard}>
            <div className={styles.stepNum}>01</div>
            <div className={styles.stepTitle}>Open a pull request</div>
            <div className={styles.stepDesc}>
              Push your code and open a PR on GitHub. That&#39;s your only job.
            </div>
            <div className={styles.stepVisual}>
              <div className={styles.prMock}>
                <div className={styles.prMockBar}>
                  <span className={styles.prMockBadge}>Open</span>
                  <span className={styles.prMockBranch}>feat/new-ui</span>
                  <span className={styles.prMockArrow}>&larr;</span>
                  <span className={styles.prMockBranch}>main</span>
                </div>
                <div className={styles.prMockDiff}>
                  <div className={styles.diffLine}>
                    <span className={styles.diffPlus}>+</span>
                    <span className={styles.diffCode}>&lt;Dashboard /&gt;</span>
                  </div>
                  <div className={styles.diffLine}>
                    <span className={styles.diffPlus}>+</span>
                    <span className={styles.diffCode}>&lt;Settings /&gt;</span>
                  </div>
                  <div className={styles.diffLine}>
                    <span className={styles.diffMinus}>&minus;</span>
                    <span className={styles.diffCode}>&lt;OldPage /&gt;</span>
                  </div>
                </div>
                <div className={styles.prMockFiles}>
                  <div className={styles.prMockFile}>
                    <span className={styles.fileChanged}>M</span> src/app/dashboard.tsx
                  </div>
                  <div className={styles.prMockFile}>
                    <span className={styles.fileAdded}>A</span> src/app/settings.tsx
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Connector arrow */}
          <div className={styles.stepConnector}>
            <div className={styles.connectorLine} />
            <div className={styles.connectorArrow}>&rarr;</div>
          </div>

          {/* Step 2 — Server pipeline */}
          <div className={`${styles.stepCard} ${styles.stepCardLarge}`}>
            <div className={styles.stepNum}>02</div>
            <div className={styles.stepTitle}>Glimpse takes over</div>
            <div className={styles.stepDesc}>
              Our server spins up a VM, analyzes your diff and codebase, launches Browser Use to navigate and record, then post-processes the video.
            </div>
            <div className={styles.stepVisual}>
              <div className={styles.serverPipeline}>
                <div className={styles.pipeStage}>
                  <div className={styles.pipeIcon}>
                    <div className={styles.vmIcon}>
                      <div className={styles.vmBar} />
                      <div className={styles.vmBar} />
                      <div className={styles.vmBar} />
                    </div>
                  </div>
                  <span className={styles.pipeLabel}>Spin up VM</span>
                </div>
                <div className={styles.pipeArrow}>&rsaquo;</div>
                <div className={styles.pipeStage}>
                  <div className={styles.pipeIcon}>
                    <div className={styles.diffIcon}>
                      <div className={styles.diffIconLine} />
                      <div className={styles.diffIconLine} />
                      <div className={styles.diffIconLine} />
                    </div>
                  </div>
                  <span className={styles.pipeLabel}>Analyze diff</span>
                </div>
                <div className={styles.pipeArrow}>&rsaquo;</div>
                <div className={styles.pipeStage}>
                  <div className={styles.pipeIcon}>
                    <div className={styles.browserIcon}>
                      <div className={styles.browserDots}>
                        <div className={styles.bDot} />
                        <div className={styles.bDot} />
                        <div className={styles.bDot} />
                      </div>
                      <div className={styles.browserBody} />
                    </div>
                  </div>
                  <span className={styles.pipeLabel}>Browser Use</span>
                </div>
                <div className={styles.pipeArrow}>&rsaquo;</div>
                <div className={styles.pipeStage}>
                  <div className={styles.pipeIcon}>
                    <div className={styles.recordIcon}>
                      <div className={styles.recDot} />
                    </div>
                  </div>
                  <span className={styles.pipeLabel}>Record</span>
                </div>
                <div className={styles.pipeArrow}>&rsaquo;</div>
                <div className={styles.pipeStage}>
                  <div className={styles.pipeIcon}>
                    <div className={styles.renderIcon}>
                      <div className={styles.renderBar} />
                      <div className={styles.renderBar} />
                      <div className={styles.renderBar} />
                    </div>
                  </div>
                  <span className={styles.pipeLabel}>Post-process</span>
                </div>
              </div>
              {/* Animated progress bar under pipeline */}
              <div className={styles.pipeProgress}>
                <div className={styles.pipeProgressBar} />
              </div>
            </div>
          </div>

          {/* Connector arrow */}
          <div className={styles.stepConnector}>
            <div className={styles.connectorLine} />
            <div className={styles.connectorArrow}>&rarr;</div>
          </div>

          {/* Step 3 — PR has a video */}
          <div className={styles.stepCard}>
            <div className={styles.stepNum}>03</div>
            <div className={styles.stepTitle}>Your PR has a demo video</div>
            <div className={styles.stepDesc}>
              A beautiful, cinematic demo video is posted right on your pull request. No effort required.
            </div>
            <div className={styles.stepVisual}>
              <div className={styles.prResultMock}>
                <div className={styles.prResultComment}>
                  <div className={styles.prResultAvatar}>G</div>
                  <div className={styles.prResultBody}>
                    <div className={styles.prResultMeta}>
                      <span className={styles.prResultName}>glimpse-bot</span>
                      <span className={styles.prResultTag}>bot</span>
                    </div>
                    <div className={styles.prResultText}>Demo video ready:</div>
                    <div className={styles.prResultVideo}>
                      <div className={styles.prVideoThumb}>
                        <div className={styles.prVideoApp}>
                          <div className={styles.prVideoSb} />
                          <div className={styles.prVideoMn}>
                            <div className={styles.prVideoBar} />
                            <div className={styles.prVideoCards}>
                              <div className={styles.prVideoCd} />
                              <div className={styles.prVideoCd} />
                            </div>
                          </div>
                        </div>
                        <div className={styles.prVideoPlay}>&#9654;</div>
                      </div>
                      <span className={styles.prVideoDur}>0:42</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats ── */}
      <div ref={statsRef} className={`${styles.statsSection} ${styles.reveal}`}>
        <div className={styles.stat}>
          <div className={styles.statNum}><AnimatedCounter target={60} suffix="s" /></div>
          <div className={styles.statLabel}>Avg. generation time</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statNum}><AnimatedCounter target={0} suffix="" /></div>
          <div className={styles.statLabel}>Manual effort required</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statNum}><AnimatedCounter target={100} suffix="%" /></div>
          <div className={styles.statLabel}>Automated pipeline</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statNum}>&infin;</div>
          <div className={styles.statLabel}>Channels supported</div>
        </div>
      </div>

      {/* ── Use cases ── */}
      <section id="use-cases" ref={useCasesRef} className={`${styles.useCasesSection} ${styles.reveal}`}>
        <div className={styles.sectionLabel}>Use cases</div>
        <h2 className={styles.sectionTitle}>Built for teams who ship fast</h2>
        <p className={styles.sectionDesc}>
          Every team has a different workflow. Glimpse fits into all of them.
        </p>
        <div className={`${styles.useCasesGrid} ${styles.stagger}`}>

          {/* Card 1 — PR Review */}
          <div className={styles.useCase}>
            <div className={styles.ucVisual}>
              <div className={styles.ucPr}>
                <div className={styles.ucPrHeader}>
                  <span className={styles.ucPrBadge}>Open</span>
                  <span className={styles.ucPrTitle}>feat: add checkout flow</span>
                </div>
                <div className={styles.ucPrComment}>
                  <div className={styles.ucPrAvatar}>G</div>
                  <div className={styles.ucPrBody}>
                    <div className={styles.ucPrMeta}>
                      <span className={styles.ucPrName}>glimpse-bot</span>
                      <span className={styles.ucPrTag}>bot</span>
                    </div>
                    <div className={styles.ucPrVideoRow}>
                      <div className={styles.ucPrThumb}>
                        <div className={styles.ucPrPlay}>&#9654;</div>
                      </div>
                      <div className={styles.ucPrInfo}>
                        <div className={styles.ucPrInfoLine} />
                        <div className={styles.ucPrInfoLine} style={{ width: "60%" }} />
                      </div>
                    </div>
                  </div>
                </div>
                <div className={styles.ucPrChecks}>
                  <div className={styles.ucCheck}><span className={styles.ucCheckIcon}>&#10003;</span> Build passed</div>
                  <div className={styles.ucCheck}><span className={styles.ucCheckIcon}>&#10003;</span> Demo recorded</div>
                </div>
              </div>
            </div>
            <div className={styles.ucText}>
              <div className={styles.ucNum}>01</div>
              <div className={styles.useCaseTitle}>PR review</div>
              <div className={styles.useCaseDesc}>
                Every pull request gets a video showing exactly what changed.
                Reviewers see the feature in action without pulling the branch.
              </div>
            </div>
          </div>

          {/* Card 2 — Stakeholder updates */}
          <div className={styles.useCase}>
            <div className={styles.ucVisual}>
              <div className={styles.ucSlack}>
                <div className={styles.ucSlackHeader}>
                  <span className={styles.ucSlackChannel}># product-updates</span>
                </div>
                <div className={styles.ucSlackMsg}>
                  <div className={styles.ucSlackAvatar}>G</div>
                  <div className={styles.ucSlackBody}>
                    <div className={styles.ucSlackName}>glimpse-bot</div>
                    <div className={styles.ucSlackContent}>New demo for <span className={styles.ucSlackHighlight}>checkout flow</span>:</div>
                    <div className={styles.ucSlackEmbed}>
                      <div className={styles.ucSlackEmbedBar} />
                      <div className={styles.ucSlackEmbedBody}>
                        <div className={styles.ucSlackEmbedTitle}>PR #142 Demo</div>
                        <div className={styles.ucSlackEmbedThumb}>
                          <div className={styles.ucSlackPlay}>&#9654;</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className={styles.ucSlackReactions}>
                  <span className={styles.ucReaction}>&#128064; 4</span>
                  <span className={styles.ucReaction}>&#128077; 2</span>
                  <span className={styles.ucReaction}>&#127881; 1</span>
                </div>
              </div>
            </div>
            <div className={styles.ucText}>
              <div className={styles.ucNum}>02</div>
              <div className={styles.useCaseTitle}>Stakeholder updates</div>
              <div className={styles.useCaseDesc}>
                Share polished demo videos with product managers and designers.
                No more &ldquo;can you show me on a call?&rdquo; messages.
              </div>
            </div>
          </div>

          {/* Card 3 — QA documentation */}
          <div className={styles.useCase}>
            <div className={styles.ucVisual}>
              <div className={styles.ucQa}>
                <div className={styles.ucQaHeader}>Visual regression log</div>
                <div className={styles.ucQaRows}>
                  <div className={styles.ucQaRow}>
                    <span className={styles.ucQaStatus} data-status="pass" />
                    <span className={styles.ucQaRoute}>/dashboard</span>
                    <span className={styles.ucQaDur}>0:18</span>
                  </div>
                  <div className={styles.ucQaRow}>
                    <span className={styles.ucQaStatus} data-status="pass" />
                    <span className={styles.ucQaRoute}>/settings</span>
                    <span className={styles.ucQaDur}>0:12</span>
                  </div>
                  <div className={styles.ucQaRow}>
                    <span className={styles.ucQaStatus} data-status="warn" />
                    <span className={styles.ucQaRoute}>/checkout</span>
                    <span className={styles.ucQaDur}>0:24</span>
                  </div>
                  <div className={styles.ucQaRow}>
                    <span className={styles.ucQaStatus} data-status="pass" />
                    <span className={styles.ucQaRoute}>/profile</span>
                    <span className={styles.ucQaDur}>0:09</span>
                  </div>
                </div>
                <div className={styles.ucQaFooter}>
                  <span>4 routes recorded</span>
                  <span>1:03 total</span>
                </div>
              </div>
            </div>
            <div className={styles.ucText}>
              <div className={styles.ucNum}>03</div>
              <div className={styles.useCaseTitle}>QA documentation</div>
              <div className={styles.useCaseDesc}>
                Automated visual regression tracking. See exactly how the UI
                behaves after every change with a permanent video record.
              </div>
            </div>
          </div>

          {/* Card 4 — Release changelogs */}
          <div className={styles.useCase}>
            <div className={styles.ucVisual}>
              <div className={styles.ucChangelog}>
                <div className={styles.ucClHeader}>v2.4.0 &middot; Changelog</div>
                <div className={styles.ucClEntries}>
                  <div className={styles.ucClEntry}>
                    <div className={styles.ucClDot} />
                    <div className={styles.ucClInfo}>
                      <div className={styles.ucClTitle}>New checkout flow</div>
                      <div className={styles.ucClThumb}>
                        <div className={styles.ucClPlaySmall}>&#9654;</div>
                      </div>
                    </div>
                  </div>
                  <div className={styles.ucClEntry}>
                    <div className={styles.ucClDot} />
                    <div className={styles.ucClInfo}>
                      <div className={styles.ucClTitle}>Redesigned settings</div>
                      <div className={styles.ucClThumb}>
                        <div className={styles.ucClPlaySmall}>&#9654;</div>
                      </div>
                    </div>
                  </div>
                  <div className={styles.ucClEntry}>
                    <div className={styles.ucClDot} />
                    <div className={styles.ucClInfo}>
                      <div className={styles.ucClTitle}>Team dashboard</div>
                      <div className={styles.ucClThumb}>
                        <div className={styles.ucClPlaySmall}>&#9654;</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className={styles.ucText}>
              <div className={styles.ucNum}>04</div>
              <div className={styles.useCaseTitle}>Release changelogs</div>
              <div className={styles.useCaseDesc}>
                Auto-generate visual changelogs for each release. Show users
                what&#39;s new with actual video, not just bullet points.
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* ── Code snippet ── */}
      <section ref={codeRef} className={`${styles.codeSection} ${styles.reveal}`}>
        <div className={styles.codeContent}>
          <div className={styles.sectionLabel}>Get started</div>
          <h2 className={styles.sectionTitle}>One command. That&#39;s it.</h2>
          <p className={styles.sectionDesc}>
            Run the skill from Claude Code, or let the GitHub bot handle it
            automatically on every PR. No config files. No setup wizard.
          </p>
        </div>
        <div className={styles.codeBlock}>
          <div className={styles.codeHeader}>
            <div className={styles.codeHeaderDots}>
              <div className={styles.codeHeaderDot} />
              <div className={styles.codeHeaderDot} />
              <div className={styles.codeHeaderDot} />
            </div>
            <span className={styles.codeFileName}>terminal</span>
          </div>
          <div className={styles.codeBody}>
            <div className={styles.codeLine}>
              <span className={styles.codeLineNum}>1</span>
              <span className={styles.codeLineContent}>
                <span className={styles.codeKeyword}>$</span> claude
              </span>
            </div>
            <div className={styles.codeLine}>
              <span className={styles.codeLineNum}>2</span>
              <span className={styles.codeLineContent}>&nbsp;</span>
            </div>
            <div className={styles.codeLine}>
              <span className={styles.codeLineNum}>3</span>
              <span className={styles.codeLineContent}>
                <span className={styles.codeKeyword}>&gt;</span> /record-demo
              </span>
            </div>
            <div className={styles.codeLine}>
              <span className={styles.codeLineNum}>4</span>
              <span className={styles.codeLineContent}>&nbsp;</span>
            </div>
            <div className={styles.codeLine}>
              <span className={styles.codeLineNum}>5</span>
              <span className={styles.codeLineContent}>
                Analyzing diff... <span className={styles.codeKeyword}>done</span>
              </span>
            </div>
            <div className={styles.codeLine}>
              <span className={styles.codeLineNum}>6</span>
              <span className={styles.codeLineContent}>
                Recording 2 routes... <span className={styles.codeKeyword}>done</span>
              </span>
            </div>
            <div className={styles.codeLine}>
              <span className={styles.codeLineNum}>7</span>
              <span className={styles.codeLineContent}>
                Rendering video... <span className={styles.codeKeyword}>done</span>
              </span>
            </div>
            <div className={styles.codeLine}>
              <span className={styles.codeLineNum}>8</span>
              <span className={styles.codeLineContent}>&nbsp;</span>
            </div>
            <div className={styles.codeLine}>
              <span className={styles.codeLineNum}>9</span>
              <span className={styles.codeLineContent}>
                <span className={styles.codeKeyword}>Video uploaded</span> &rarr; glimpse.dev/runs/a8f3k2
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section ref={ctaRef} className={`${styles.ctaSection} ${styles.reveal}`}>
        <div className={styles.ctaGrid} />
        <h2 className={styles.ctaTitle}>
          Stop recording.<br />Start shipping.
        </h2>
        <p className={styles.ctaDesc}>
          Let AI handle your demo videos so you can focus on building.
          Set it up once, forget about it forever.
        </p>
        <div className={styles.ctaButtons}>
          <Link href="/dashboard" className={styles.ctaPrimary}>
            Get started
            <span>&rarr;</span>
          </Link>
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.ctaSecondary}
          >
            View on GitHub
          </a>
        </div>
      </section>

      {/* ── Powered by marquee ── */}
      <section className={styles.poweredBySection}>
        <div className={styles.poweredByLabel}>Powered by</div>
        <div className={styles.marqueeContainer}>
          <div className={styles.marqueeTrack}>
            {[...Array(2)].map((_, setIdx) => (
              <div key={setIdx} style={{ display: "flex", gap: "1px" }}>
                {[
                  { logo: "/logos/github.svg", name: "GitHub" },
                  { logo: "/logos/convex.svg", name: "Convex" },
                  { logo: "/logos/daytona.png", name: "Daytona" },
                  { logo: "/logos/laminar.png", name: "Laminar" },
                  { logo: "/logos/supermemory.png", name: "Supermemory" },
                  { logo: "/logos/agentmail.png", name: "AgentMail" },
                  { logo: "/logos/composio.png", name: "Composio" },
                  { logo: "/logos/browseruse.png", name: "Browser Use" },
                  { logo: "/logos/slack.svg", name: "Slack" },
                  { logo: "/logos/discord.svg", name: "Discord" },
                  { logo: "/logos/aws.png", name: "AWS" },
                  { logo: "/logos/ffmpeg.svg", name: "FFmpeg" },
                  { logo: "/logos/playwright.svg", name: "Playwright" },
                ].map((item) => (
                  <div key={item.name} className={styles.marqueeItem}>
                    <Image
                      src={item.logo}
                      alt={item.name}
                      width={20}
                      height={20}
                      className={styles.marqueeLogo}
                    />
                    {item.name}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className={styles.footer}>
        <div className={styles.footerLeft}>
          <div className={styles.footerLogo}>Glimpse</div>
          <div className={styles.footerCopy}>&copy; 2026 Glimpse. All rights reserved.</div>
        </div>
        <div className={styles.footerLinks}>
          <Link href="/dashboard" className={styles.footerLink}>Dashboard</Link>
          <a href="https://github.com" target="_blank" rel="noopener noreferrer" className={styles.footerLink}>GitHub</a>
          <span className={styles.footerLink}>Docs</span>
          <span className={styles.footerLink}>Changelog</span>
        </div>
      </footer>
    </div>
  );
}
