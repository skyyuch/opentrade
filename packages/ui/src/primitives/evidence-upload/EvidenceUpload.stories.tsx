import { useCallback, useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import {
  EvidenceUpload,
  type EvidenceUploadFile,
  type EvidenceUploadLabels,
} from './EvidenceUpload';

import type { Meta, StoryObj } from '@storybook/react-vite';

const enLabels: EvidenceUploadLabels = {
  dropTitle: 'Click to select a file, or drag here',
  dropDesc: 'Make sure your statement contains your name and the broker name.',
  sizeHint: 'PDF / JPG / PNG / WebP, max 10MB',
  uploading: 'Uploading…',
  removeFile: 'Remove file',
  ipfsCidLabel: 'IPFS CID',
};

const zhHantLabels: EvidenceUploadLabels = {
  dropTitle: '點擊選擇檔案，或拖曳至此',
  dropDesc: '請確保證據包含你的姓名與券商名稱。',
  sizeHint: '支援 PDF、JPG、PNG、WebP（最大 10MB）',
  uploading: '上傳中…',
  removeFile: '移除檔案',
  ipfsCidLabel: 'IPFS CID',
};

const zhHansLabels: EvidenceUploadLabels = {
  dropTitle: '点击选择文件，或拖曳至此',
  dropDesc: '请确保证据包含你的姓名与券商名称。',
  sizeHint: '支持 PDF、JPG、PNG、WebP（最大 10MB）',
  uploading: '上传中…',
  removeFile: '移除文件',
  ipfsCidLabel: 'IPFS CID',
};

const ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp';

// Tiny 1x1 transparent PNG (data URL) so the uploaded story renders a
// real <img> without shipping a binary fixture.
const SAMPLE_IMAGE_PREVIEW =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

const SAMPLE_UPLOADED_IMAGE: EvidenceUploadFile = {
  fileName: 'statement-2026-04.png',
  fileSize: 1.4 * 1024 * 1024,
  cid: 'bafybeih7jvqz4uhmkb6kgbcsnyclrtmoxlsfak7s2y7q4mpxr6t7zlhqvm',
  previewUrl: SAMPLE_IMAGE_PREVIEW,
};

const SAMPLE_UPLOADED_PDF: EvidenceUploadFile = {
  fileName: 'monthly-statement-q1.pdf',
  fileSize: 0.8 * 1024 * 1024,
  cid: 'bafkreigh7xs2vw4n6vc7w5y3kpmlbqyhd2uemfg5p3z6anzy2xzv4lsoua',
  previewUrl: null,
};

const noop = (): void => {
  // intentional no-op for story-default args
};

const meta = {
  title: 'Primitives / EvidenceUpload',
  component: EvidenceUpload,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Drop-zone primitive for evidence uploads (verify-broker + complaint flows). ' +
          'Owns drag-drop + visual three-state machine (`idle` / `uploading` / `uploaded`); ' +
          'host owns I/O (Pinata pin) and MIME/size validation. Caller-supplied labels keep ' +
          '`packages/ui` free of `next-intl` coupling per rule 10.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    status: { control: 'inline-radio', options: ['idle', 'uploading', 'uploaded'] },
    theme: { control: 'inline-radio', options: ['neon', 'semantic'] },
    disabled: { control: 'boolean' },
    acceptAttribute: { control: 'text' },
  },
  args: {
    status: 'idle',
    uploaded: null,
    acceptAttribute: ACCEPT,
    theme: 'neon',
    disabled: false,
    onFileSelected: noop,
    onRemove: noop,
    labels: enLabels,
  },
} satisfies Meta<typeof EvidenceUpload>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Idle: Story = {
  args: { status: 'idle' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const zone = canvas.getByRole('button');
    await expect(zone).toHaveAttribute('data-state', 'idle');
    await expect(zone).toHaveAttribute('aria-busy', '');
  },
};

export const Uploading: Story = {
  args: { status: 'uploading' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(enLabels.uploading)).toBeInTheDocument();
  },
};

export const UploadedImage: Story = {
  args: { status: 'uploaded', uploaded: SAMPLE_UPLOADED_IMAGE },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(SAMPLE_UPLOADED_IMAGE.fileName)).toBeInTheDocument();
    await expect(canvas.getByText(enLabels.removeFile)).toBeInTheDocument();
    const thumb = canvas.getByAltText(SAMPLE_UPLOADED_IMAGE.fileName);
    await expect(thumb).toHaveAttribute('src', SAMPLE_IMAGE_PREVIEW);
  },
};

export const UploadedPdf: Story = {
  args: { status: 'uploaded', uploaded: SAMPLE_UPLOADED_PDF },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(SAMPLE_UPLOADED_PDF.fileName)).toBeInTheDocument();
    // PDFs render the generic FileText icon, not an <img> thumbnail.
    await expect(canvas.queryByAltText(SAMPLE_UPLOADED_PDF.fileName)).toBeNull();
  },
};

export const Disabled: Story = {
  args: { status: 'idle', disabled: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // A disabled idle zone is not in the tab order, so no role="button" lookup.
    // We still expect the empty-state copy to render so the user sees the prompt.
    await expect(canvas.getByText(enLabels.dropTitle)).toBeInTheDocument();
  },
};

export const SemanticOnLightSurface: Story = {
  args: { status: 'idle', theme: 'semantic' },
  decorators: [
    (StoryComp) => (
      <div className="rounded-lg bg-background p-8 text-foreground">
        <StoryComp />
      </div>
    ),
  ],
};

export const SemanticOnDarkSurface: Story = {
  args: { status: 'idle', theme: 'semantic' },
  decorators: [
    (StoryComp) => (
      <div className="dark rounded-lg bg-background p-8 text-foreground">
        <StoryComp />
      </div>
    ),
  ],
};

export const NeonOnDarkSurface: Story = {
  args: { status: 'idle', theme: 'neon' },
  decorators: [
    (StoryComp) => (
      <div className="rounded-lg bg-[#050608] p-8">
        <StoryComp />
      </div>
    ),
  ],
};

/**
 * Side-by-side locales so designers can verify CJK punctuation,
 * line-length, and copy clearance against the three locales OpenTrade
 * ships (zh-Hant default, zh-Hans, en).
 */
export const Localised: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <div className="flex flex-col gap-6">
      {(
        [
          ['zh-Hant', zhHantLabels],
          ['zh-Hans', zhHansLabels],
          ['en', enLabels],
        ] as const
      ).map(([locale, labels]) => (
        <div key={locale} className="flex flex-col gap-2">
          <p className="font-mono text-xs uppercase text-muted-foreground">{locale}</p>
          <EvidenceUpload
            status="idle"
            uploaded={null}
            acceptAttribute={ACCEPT}
            onFileSelected={noop}
            onRemove={noop}
            labels={labels}
            theme="semantic"
          />
        </div>
      ))}
    </div>
  ),
};

/**
 * Interactive demo with a real local state machine — picking a file
 * advances to `uploading`, then a 600ms fake "upload" settles into
 * `uploaded`. Used in Storybook interactions to verify the full
 * happy-path flow without hitting a real Pinata endpoint.
 */
export const ClickFlow: Story = {
  parameters: { controls: { disable: true } },
  render: function ClickFlowRender() {
    const [status, setStatus] = useState<'idle' | 'uploading' | 'uploaded'>('idle');
    const [uploaded, setUploaded] = useState<EvidenceUploadFile | null>(null);

    const handleFileSelected = useCallback((file: File) => {
      setStatus('uploading');
      // Simulate Pinata latency.
      setTimeout(() => {
        setUploaded({
          fileName: file.name,
          fileSize: file.size || 1024 * 512,
          cid: 'bafybeixfakecidforstoryinteractionjustforflowdemonstration1234567',
          previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
        });
        setStatus('uploaded');
      }, 600);
    }, []);

    const handleRemove = useCallback(() => {
      if (uploaded?.previewUrl) URL.revokeObjectURL(uploaded.previewUrl);
      setUploaded(null);
      setStatus('idle');
    }, [uploaded]);

    return (
      <EvidenceUpload
        status={status}
        uploaded={uploaded}
        acceptAttribute={ACCEPT}
        onFileSelected={handleFileSelected}
        onRemove={handleRemove}
        labels={enLabels}
        theme="semantic"
      />
    );
  },
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);
    await step('renders idle state initially', async () => {
      await expect(canvas.getByText(enLabels.dropTitle)).toBeInTheDocument();
    });
    await step('typing into the file input advances to uploaded', async () => {
      const input = canvasElement.querySelector('input[type="file"]');
      if (!(input instanceof HTMLInputElement)) {
        throw new Error('Expected the idle state to render a file input');
      }
      const fakeFile = new File(['hello'], 'note.pdf', { type: 'application/pdf' });
      await userEvent.upload(input, fakeFile);
      // Wait for the 600ms fake-upload timeout to settle.
      await new Promise((r) => setTimeout(r, 800));
      await expect(canvas.getByText('note.pdf')).toBeInTheDocument();
      await expect(canvas.getByText(enLabels.removeFile)).toBeInTheDocument();
    });
  },
};
