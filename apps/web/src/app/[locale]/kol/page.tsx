import { redirect } from 'next/navigation';

import type { ReactNode } from 'react';

type Props = {
  params: { locale: string };
};

const KolIndexPage = ({ params }: Props): ReactNode => {
  redirect(`/${params.locale}/kol/dashboard`);
};

export default KolIndexPage;
