import { SignUp } from "@clerk/nextjs";
import { Box, Container, Center } from "@mantine/core";

export default function SignUpPage() {
  return (
    <Container size="sm" py="xl">
      <Center>
        <Box sx={{ width: '100%', maxWidth: 500 }}>
          <SignUp path="/sign-up" routing="path" signInUrl="/sign-in" />
        </Box>
      </Center>
    </Container>
  );
}