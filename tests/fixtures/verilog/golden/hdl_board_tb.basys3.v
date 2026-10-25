`timescale 1ns/1ps

module hdl_board_tb;
  reg         clk_sig    = 1'b0;
  reg         clk500_sig = 1'b0;
  reg  [15:0] sw_sig     = 16'b0;
  reg  [4:0]  key_sig    = 5'b0;
  wire [15:0] ledr_sig;
  wire [6:0]  seg_sig;
  wire        dp_sig;
  wire [3:0]  an_sig;

  // A multiplexed display, decoded into stable digits (docs/board_io_v2_spec.md § 7.4):
  // each digit keeps the segments it showed while enabled, for DISPLAY_PERSIST.
  localparam [63:0] DISPLAY_PERSIST = 64'd75000000;
  localparam AN_ON = 1'b0;
  localparam SEG_OFF = 1'b1;
  reg [7:0] digit_word [0:3];
  reg [63:0] digit_last [0:3];
  reg [3:0] digit_seen = 0;

  basys_top uut (.clk(clk_sig), .CLOCK_500Hz(clk500_sig), .sw(sw_sig), .btnC(key_sig[0]), .btnU(key_sig[1]), .btnL(key_sig[2]), .btnR(key_sig[3]), .btnD(key_sig[4]), .led(ledr_sig), .seg(seg_sig), .dp(dp_sig), .an(an_sig));

  integer capture_digit;
  reg [3:0] digit_on = 0;
  always @(seg_sig or dp_sig or an_sig)
    for (capture_digit = 0; capture_digit < 4; capture_digit = capture_digit + 1)
      if (an_sig[capture_digit] === AN_ON) begin
        digit_word[capture_digit] = {dp_sig, seg_sig};
        digit_last[capture_digit] = $time;
        digit_seen[capture_digit] = 1'b1;
        digit_on[capture_digit] = 1'b1;
      end else if (digit_on[capture_digit]) begin
        // Switched off: the hold of DISPLAY_PERSIST starts now.
        digit_last[capture_digit] = $time;
        digit_on[capture_digit] = 1'b0;
      end

  // Enabled: the live segments. Unknown enable: X. Refreshed lately: the latched word. Else off.
  function [7:0] display_word(input integer d);
    begin
      if (an_sig[d] === AN_ON) display_word = {dp_sig, seg_sig};
      else if (an_sig[d] !== ~AN_ON) display_word = {8{1'bx}};
      else if (digit_seen[d] && $time - digit_last[d] <= DISPLAY_PERSIST) display_word = digit_word[d];
      else display_word = {8{SEG_OFF}};
    end
  endfunction

  always #5 clk_sig = ~clk_sig;
  always #1000000 clk500_sig = ~clk500_sig;

  reg [1023:0] input_file, output_file, heartbeat_file;
  integer poll_interval_ns, min_dwell_ns;
  initial begin
    if (!$value$plusargs("input_file=%s", input_file)) input_file = 0;
    if (!$value$plusargs("output_file=%s", output_file)) output_file = 0;
    if (!$value$plusargs("heartbeat_file=%s", heartbeat_file)) heartbeat_file = 0;
    if (!$value$plusargs("poll_interval_ns=%d", poll_interval_ns)) poll_interval_ns = 1000;
    if (!$value$plusargs("min_dwell_ns=%d", min_dwell_ns)) min_dwell_ns = 0;
  end

  // Real-time pacing: after every 20 ms of simulated time, report progress and
  // block on one stdin line (32'h8000_0000).
  integer fhb, pace_status;
  reg [255:0] pace_line;
  initial begin
    #1;
    forever begin
      #20000000;
      if (heartbeat_file != 0) begin
        fhb = $fopen(heartbeat_file, "w");
        $fdisplay(fhb, "%0d", $time / 1000000);
        $fclose(fhb);
      end
      pace_status = $fgets(pace_line, 32'h8000_0000);
    end
  end

  // Board I/O: apply at most one queued input line per poll, publish the
  // 48-bit board state whenever it (or the applied sequence number) changes.
  reg [47:0] board_bits;
  integer fin, fout, scan_count, seq, applied_seq = 0, last_seq = -1;
  reg [20:0] rec;
  reg [47:0] last_bits = 48'bx;
  time applied_at = 0;
  reg applied_one;
  initial begin
    #1;
    forever begin
      #(poll_interval_ns * 1);
      if (input_file != 0 && ($time - applied_at) >= min_dwell_ns) begin
        fin = $fopen(input_file, "r");
        if (fin != 0) begin
          applied_one = 0;
          while (!applied_one && !$feof(fin)) begin
            scan_count = $fscanf(fin, "%d %b", seq, rec);
            if (scan_count == 2 && seq > applied_seq) begin
              sw_sig = rec[20:5];
              key_sig = rec[4:0];
              applied_seq = seq;
              applied_at = $time;
              applied_one = 1;
            end
          end
          $fclose(fin);
        end
      end
      board_bits = {ledr_sig, display_word(0), display_word(1), display_word(2), display_word(3)};
      if (output_file != 0 && (board_bits !== last_bits || applied_seq != last_seq)) begin
        fout = $fopen(output_file, "w");
        $fdisplay(fout, "%b %0d", board_bits, applied_seq);
        $fclose(fout);
        last_bits = board_bits;
        last_seq = applied_seq;
      end
    end
  end
endmodule
