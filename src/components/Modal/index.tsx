import { ReactNode } from 'react';
import { Root, Portal, Overlay, Content } from '@radix-ui/react-dialog';

type ModalProps = {
  children: ReactNode;
  onClose: () => void;
  open: boolean;
};

export default function Modal({
  children,
  onClose,
  open,
}: ModalProps): JSX.Element {
  return (
    <Root onOpenChange={onClose} open={open}>
      <Portal>
        <Overlay className='data-[state=open]:animate-overlayShow fixed inset-0 bg-slate-600/40'>
          <Content className='bg-[#2D2047] data-[state=open]:animate-contentShow dark:bg-primaryDark-100 fixed left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] overflow-auto rounded-[6px] p-[25px] focus:outline-none'>
            {children}
          </Content>
        </Overlay>
      </Portal>
    </Root>
  );
}
