import { ReactNode } from 'react';
import Header from 'components/Header';
import Footer from 'components/Footer';

type MainLayoutProps = {
  children: ReactNode;
};

export default function MainLayout({ children }: MainLayoutProps): JSX.Element {
  return (
    <div className='h-[100dvh] flex flex-col'>
      <Header />
      <div className='flex-1'>{children}</div>
      <Footer />
    </div>
  );
}
