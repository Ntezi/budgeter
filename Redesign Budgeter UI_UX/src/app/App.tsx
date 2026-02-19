import { RouterProvider } from 'react-router';
import { router } from './routes';
import { AppProvider } from './lib/store';
import { Toaster } from 'sonner';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { ThemeProvider } from 'next-themes';

export default function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <AppProvider>
        <DndProvider backend={HTML5Backend}>
          <RouterProvider router={router} />
          <Toaster />
        </DndProvider>
      </AppProvider>
    </ThemeProvider>
  );
}
