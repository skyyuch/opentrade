import { redirect } from 'next/navigation';

import type { ReactNode } from 'react';

type Props = {
  params: Promise<{ locale: string }>;
};

const KolIndexPage = async (props: Props): Promise<ReactNode> => {
  const params = await props.params;
  redirect(`/${params.locale}/kol/dashboard`);
};

export default KolIndexPage;
