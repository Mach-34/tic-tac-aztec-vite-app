import MainLayout from 'layouts/MainLayout';
import joker from 'assets/batman-the-joker.gif';

export default function NotFound() {
  return (
    <MainLayout>
      <div className='flex flex-col items-center justify-center h-full'>
        <div className='text-6xl text-[#2D2047]'>Quit clowning around!!!</div>
        <div className='my-4 text-lg'> There ain't nothing for you here.</div>
        <img alt='Joker' className='rounded-xl' src={joker} />
      </div>
    </MainLayout>
  );
}
