/**
 * TipTap image node that stores only the IPFS `cid` in the document JSON and
 * derives the rendered `src` from the gateway at render time (ADR-0039 D3).
 *
 * Why a custom node: embedded images must be content-addressed and portable —
 * the persisted `bodyJson` must reference the immutable `cid`, never a
 * gateway-specific URL (which could rotate). We keep `cid` as the canonical
 * attribute and reconstruct `src` via {@link ipfsGatewayUrl} for both the
 * editor and the read-only viewer, so the two stay in sync.
 */

import Image from '@tiptap/extension-image';

import { ipfsGatewayUrl } from '../../lib/ipfs';

export const CidImage = Image.extend({
  addAttributes() {
    return {
      cid: { default: null },
      alt: { default: null },
      title: { default: null },
    };
  },

  renderHTML({ node }) {
    const cid = typeof node.attrs['cid'] === 'string' ? node.attrs['cid'] : null;
    const alt = typeof node.attrs['alt'] === 'string' ? node.attrs['alt'] : null;
    const title = typeof node.attrs['title'] === 'string' ? node.attrs['title'] : null;
    return [
      'img',
      {
        src: cid ? ipfsGatewayUrl(cid) : '',
        ...(cid ? { 'data-cid': cid } : {}),
        ...(alt ? { alt } : {}),
        ...(title ? { title } : {}),
      },
    ];
  },

  parseHTML() {
    return [
      {
        tag: 'img[data-cid]',
        getAttrs: (el) => {
          const node = el;
          return {
            cid: node.getAttribute('data-cid'),
            alt: node.getAttribute('alt'),
            title: node.getAttribute('title'),
          };
        },
      },
    ];
  },
});
