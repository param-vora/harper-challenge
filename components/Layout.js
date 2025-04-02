import React from 'react';
import { AppShell, Header, Group, Title, Button, Text, Box } from '@mantine/core';
import { UserButton, useClerk, useUser } from '@clerk/nextjs';
import { useRouter } from 'next/router';

function Layout({ children }) {
  const { signOut } = useClerk();
  const { isSignedIn } = useUser();
  const router = useRouter();

  return (
    <AppShell
      padding="md"
      header={
        <Header height={60} p="xs">
          <Group position="apart" sx={{ height: '100%' }}>
            <Group>
              <Title order={3}>Harper AI Challenge</Title>
            </Group>
            
            <Group>
              {isSignedIn ? (
                <>
                  <UserButton afterSignOutUrl="/" />
                  <Button variant="subtle" onClick={() => signOut(() => router.push('/'))}>
                    Sign Out
                  </Button>
                </>
              ) : (
                <Group>
                  <Button variant="subtle" onClick={() => router.push('/sign-in')}>
                    Sign In
                  </Button>
                  <Button onClick={() => router.push('/sign-up')}>
                    Sign Up
                  </Button>
                </Group>
              )}
            </Group>
          </Group>
        </Header>
      }
      styles={(theme) => ({
        main: { backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[8] : theme.colors.gray[0] },
      })}
    >
      {children}
    </AppShell>
  );
}

export default Layout;
