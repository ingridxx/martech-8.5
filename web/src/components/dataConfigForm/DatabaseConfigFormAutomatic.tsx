import { Box, SimpleGrid, Stack, toast, useToast } from "@chakra-ui/react";
import * as React from "react";
import { useRecoilState } from "recoil";

import { ConfigInput } from "@/components/ConfigInput";
import { ScaleFactorSelector } from "@/components/ScaleFactorSelector";
import {
  connectionDatabase,
  connectionHost,
  connectionPassword,
  connectionUser,
} from "@/data/recoil";
import { connectToDB } from "@/data/queries";
import { Loader } from "../customcomponents/loader/Loader";
import { InvertedPrimaryButton } from "../customcomponents/Button";

type Props = {
  showDatabase?: boolean;
  showScaleFactor?: boolean;
};

export const DatabaseConfigForm = ({
  showDatabase,
  showScaleFactor,
}: Props) => {
  const toast = useToast();
  const [loading, setLoading] = React.useState(false);
  const [host, setHost] = useRecoilState(connectionHost);
  const [user, setUser] = useRecoilState(connectionUser);
  const [password, setPassword] = useRecoilState(connectionPassword);
  const [database, setDatabase] = useRecoilState(connectionDatabase);
  const [localDatabase, setLocalDatabase] = React.useState(database);

  const connect = () => {
    console.log("WE ARE CONNECTED")
    setLoading(true);
    const config = {
      host: host,
      password: password,
      user: user,
    };
    connectToDB(config).then((connected) => {
      setLoading(false);
      let database = "martech";
      if (localDatabase) {
        database = localDatabase;
      }
      if (connected === true) {
        setHost(host);
        setUser(user);
        setPassword(password);
        setDatabase(database);
      } else {
        toast({
          title: "An error occured",
          description: `${connected.message}`,
          status: "error",
          duration: 3000,
          isClosable: true,
        });
      }
    });
  };

  let databaseInput;
  if (showDatabase) {
    databaseInput = (
      <ConfigInput
        label="Martech Database Name"
        placeholder="martech"
        value={database}
        setValue={setDatabase}
      />
    );
  }

  let scaleFactor;
  if (showScaleFactor) {
    scaleFactor = <ScaleFactorSelector />;
  }

  const connectDisabled = host === "" || user === "" || password === "" || loading;

  const handleEnterKeyPress = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key.toLowerCase() === "enter") {
      connect();
    }
  };
  let connectButtonContainer = <>Connect</>;
  if (loading) {
    connectButtonContainer = (
      <Box display="flex">
        <Loader size="small" />
        &nbsp;Connecting...
      </Box>
    );
  }

  return (
    <Stack spacing={4} onKeyDown={handleEnterKeyPress}>
      <ConfigInput
        label="Workspace Host"
        placeholder="http://127.0.0.1"
        value={host}
        setValue={setHost}
        helpText="Your workspace hostname."
      />
      <SimpleGrid columns={2} gap={2}>
        <ConfigInput
          label="Workspace Group Username"
          helpText="Fill in the Security credentials of your workspace group."
          placeholder="admin"
          value={user}
          setValue={setUser}
        />
        <ConfigInput
          label="Workspace Group Password"
          placeholder=""
          value={password}
          setValue={setPassword}
          type="password"
        />
      </SimpleGrid>
      {databaseInput}
      <ConfigInput
        label="Martech Database Name"
        placeholder="martech"
        required
        value={localDatabase}
        setValue={setLocalDatabase}
      />
      {scaleFactor}
      <InvertedPrimaryButton
          width="100%"
          alignItems="center"
          isDisabled={connectDisabled}
          onClick={connect}
        >
          {connectButtonContainer}
        </InvertedPrimaryButton>
    </Stack>
  );
};
