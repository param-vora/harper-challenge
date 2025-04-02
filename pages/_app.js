// pages/_app.js
import { ClerkProvider } from '@clerk/nextjs';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import '../styles/globals.css'; // Your global styles

// Import Mantine core styles REQUIRED for components to work
import '@mantine/core/styles.css'; 
// Import Mantine notifications styles if you use them
import '@mantine/notifications/styles.css';

function MyApp({ Component, pageProps }) {
  return (
    <ClerkProvider {...pageProps}>
      <MantineProvider
        withGlobalStyles // Optional: normalize CSS
        withNormalizeCSS // Optional: normalize CSS
        theme={{
          /** Put your mantine theme override here */
          colorScheme: 'light', // Or 'dark' based on preference
          primaryColor: 'blue',
        }}
      >
        <Notifications position="top-right" zIndex={2077} /> {/* Ensure high z-index */}
        <Component {...pageProps} />
      </MantineProvider>
    </ClerkProvider>
  );
}

export default MyApp;