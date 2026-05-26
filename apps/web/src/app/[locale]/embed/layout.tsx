/**
 * Standalone embed layout — hides the parent layout's header/footer via CSS.
 * Used for embeddable widgets that KOLs place on external websites via iframe.
 *
 * Next.js App Router layouts are additive (parent always renders), so we
 * use a global style override to hide the header/footer from within this
 * route segment. The body background is also made transparent.
 */

import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
};

const EmbedLayout = ({ children }: Props): ReactNode => {
  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            header, footer { display: none !important; }
            main { min-height: 100vh !important; }
            body { background: transparent !important; }
          `,
        }}
      />
      {children}
    </>
  );
};

export default EmbedLayout;
