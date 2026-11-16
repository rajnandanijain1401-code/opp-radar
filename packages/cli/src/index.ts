import { Command } from "commander";
import { VERSION } from "@opp-radar/core";

const program = new Command();
program.name("radar").description("OppRadar CLI").version(VERSION);
program.parse();
