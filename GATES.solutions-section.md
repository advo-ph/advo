# Gates: solutions section content and ordering

OWNS: apps/web/src/components/landing/LandingPage.tsx, apps/web/src/components/LandingNav.tsx, apps/web/src/components/landing/landing-page.css, apps/web/public/landing/industry/flood.png, scripts/verify-solutions-section.mjs

Scope: move the solutions section above services, keep only Flood, School, and Parking in that order, and update the requested copy and visual hierarchy without breaking the landing page.

- [x] G1: the requested solutions content and ordering are present in the landing page source
  CHECK: node -e "const fs=require('fs'); const p=fs.readFileSync('apps/web/src/components/landing/LandingPage.tsx','utf8'); const order=['Flood','School','Parking']; const idx=order.map(x=>p.indexOf(x)); if(idx.some(x=>x<0)||idx.some((x,i)=>i&&x<=idx[i-1])) throw new Error('solutions order/content missing'); if(!p.includes('Building Real-World Technological Solutions')) throw new Error('solutions heading missing'); if(p.includes('Paper, Viber, tally sheets.')) throw new Error('removed intro copy still present'); console.log('solutions source verification passed')"
  EXPECT: solutions source verification passed
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/princewagan/advo-1; path=fd331c0faf67/40 entries; output=solutions source verification passed

- [x] G2: the web application typechecks and lints after the landing-page change
  CHECK: npm --workspace apps/web run typecheck && npm --workspace apps/web run lint && printf 'solutions checks passed\n'
  EXPECT: solutions checks passed
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/princewagan/advo-1; path=fd331c0faf67/40 entries; output=✖ 18 problems (0 errors, 18 warnings) | solutions checks passed

- [x] G3: the production web build passes after the landing-page change
  CHECK: npm --workspace apps/web run build && printf 'solutions build passed\n'
  EXPECT: solutions build passed
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/princewagan/advo-1; path=fd331c0faf67/40 entries; output=- Use build.rollupOptions.output.manualChunks to improve chunking: https://rollupjs.org/configuration-options/#output-manualchunks | - Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.

- [x] G4: the rendered landing page shows only the requested solutions cards at desktop and mobile sizes
  CHECK: node scripts/verify-solutions-section.mjs
  EXPECT: solutions browser verification passed
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/princewagan/advo-1; path=fd331c0faf67/40 entries; output=solutions browser verification passed
