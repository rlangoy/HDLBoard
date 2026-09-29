#!/bin/sh
# HDLBoard — the render stage's memory cap for one simulator run (see
# docker/Dockerfile). GHDL_EXE, IVERILOG_EXE and VVP_EXE point at links to
# this script named ghdl, iverilog and vvp; the link's name is the real tool,
# found on PATH (the links' own directory is not on it).
#
# The cap is RLIMIT_DATA: the heap and private memory one process may map.
# A design that needs more (a large RAM written as std_logic signals costs
# GHDL about 350 bytes a bit) stops in its own session, which the backend
# reports as possibly out of memory, instead of pushing the shared 512 MB
# container into the kernel's OOM killer. exec keeps the PID, so the
# backend's kill() still reaches the simulator itself.
ulimit -d $(( ${HDLBOARD_SIM_MEMORY_MB:-96} * 1024 )) || exit 1
exec "${0##*/}" "$@"
