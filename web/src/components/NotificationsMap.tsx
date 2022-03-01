import { IngestChart, useIngestChartData } from "@/components/IngestChart";
import { MarkdownText } from "@/components/MarkdownText";
import { PixiMap } from "@/components/PixiMap";
import { estimatedRowCountObj } from "@/data/queries";
import {
  connectionConfig,
  simulatorEnabled,
  tickDurationMs,
} from "@/data/recoil";
import { useSimulator } from "@/data/useSimulator";
import { formatMs } from "@/format";
import { useNotificationsRenderer } from "@/render/useNotificationsRenderer";
import {
  Alert,
  AlertIcon,
  AlertTitle,
  Box,
  Button,
  Flex,
  Grid,
  Stack,
  Stat,
  StatLabel,
  StatNumber,
  Text,
} from "@chakra-ui/react";
import { format } from "d3-format";
import { useRecoilState, useRecoilValue } from "recoil";
import useSWR from "swr";

const Stats = () => {
  /*
  - stats: num subscribers, num offers, num cities, num segments
  - line graphs: locations, requests, purchases, notifications
  - duration stats: update segments, run matching process
  - offer creator
  - visualize offers on the map?
  */

  const config = useRecoilValue(connectionConfig);

  const ingestData = useIngestChartData(
    config,
    "locations",
    "requests",
    "purchases",
    "notifications"
  );

  const tableCounts = useSWR(
    ["notificationsMapTableCounts", config],
    () =>
      estimatedRowCountObj(
        config,
        "offers",
        "subscribers",
        "cities",
        "segments"
      ),
    { refreshInterval: 1000 }
  );

  const matchingDuration = useRecoilValue(tickDurationMs("SimulatorMatcher"));
  const updateSegmentsDuration = useRecoilValue(
    tickDurationMs("SimulatorUpdateSegments")
  );

  const formatStat = format(".4~s");
  const stats = tableCounts.data ? (
    <Grid
      templateColumns="repeat(auto-fit, minmax(100px, 1fr))"
      columnGap={2}
      rowGap={2}
    >
      <Stat>
        <StatLabel>Offers</StatLabel>
        <StatNumber>{formatStat(tableCounts.data.offers)}</StatNumber>
      </Stat>
      <Stat>
        <StatLabel>Cities</StatLabel>
        <StatNumber>{formatStat(tableCounts.data.cities)}</StatNumber>
      </Stat>
      <Stat>
        <StatLabel>Subscribers</StatLabel>
        <StatNumber>{formatStat(tableCounts.data.subscribers)}</StatNumber>
      </Stat>
      <Stat>
        <StatLabel>Segments</StatLabel>
        <StatNumber>{formatStat(tableCounts.data.segments)}</StatNumber>
      </Stat>
      <Stat>
        <StatLabel>Segmentation</StatLabel>
        <StatNumber>{formatMs(updateSegmentsDuration)}</StatNumber>
      </Stat>
      <Stat>
        <StatLabel>Matching</StatLabel>
        <StatNumber>{formatMs(matchingDuration)}</StatNumber>
      </Stat>
    </Grid>
  ) : null;

  return (
    <>
      <MarkdownText>
        {`
          The map on this page displays notifications as they are delivered to
          subscribers in realtime. Below, you will find some key statistics
          about the demo.
        `}
      </MarkdownText>
      {stats}
      <Box>
        <Text fontSize="sm" fontWeight="medium">
          Row count / time
        </Text>
        <IngestChart data={ingestData} height={100} />
      </Box>
    </>
  );
};

export const NotificationsMap = () => {
  const [enabled, setEnabled] = useRecoilState(simulatorEnabled);
  useSimulator();

  return (
    <Flex
      gap={4}
      justifyContent="space-between"
      direction={["column", "column", "row"]}
      height="100%"
    >
      <Stack spacing={4} flex="2 2 0" minHeight="200px" maxHeight="100%">
        <PixiMap useRenderer={useNotificationsRenderer} />
      </Stack>
      <Stack spacing={4} flex="1 1 0" minWidth="0">
        <MarkdownText>
          {`
            S2 Cellular is a hypothetical telecom company which provides free
            cell-phone plans in exchange for delivering targeted ads to
            subscribers. To learn about how this works please visit the [overview
            page][1].

            [1]: /
          `}
        </MarkdownText>
        {enabled ? (
          <Stats />
        ) : (
          <>
            <Alert status="warning" borderRadius="md">
              <AlertIcon />
              <AlertTitle>The simulator is disabled</AlertTitle>
              <Button
                position="absolute"
                right={4}
                top={3}
                size="xs"
                colorScheme="blue"
                onClick={() => setEnabled(true)}
              >
                Enable simulator
              </Button>
            </Alert>
          </>
        )}
      </Stack>
    </Flex>
  );
};