import { SignIn } from "@clerk/nextjs";
import { Box, Container, Center } from "@mantine/core";

export default function SignInPage() {
  return (
    <Container size="sm" py="xl">
      <Center>
        <Box sx={{ width: '100%', maxWidth: 500 }}>
          <SignIn path="/sign-in" routing="path" signUpUrl="/sign-up" />
        </Box>
      </Center>
    </Container>
  );
}