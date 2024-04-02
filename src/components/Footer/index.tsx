import logo from 'assets/mach34.png';

export default function Footer(): JSX.Element {
  return (
    <div className='bg-[#2D2047] flex justify-between p-4 text-white'>
      <div>A game powered by State Channels on Aztec Network.</div>
      <div className='flex gap-2 items-center'>
        Built by Mach 34
        <img
          alt='Logo'
          className='cursor-pointer h-8 w-8 rounded-full'
          onClick={() => window.open('https://mach34.space', '_blank')}
          src={logo}
        />
      </div>
    </div>
  );
}
