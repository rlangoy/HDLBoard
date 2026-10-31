`timescale 1ns/1ps

module hdl_board_tb;
  reg         clk_sig    = 1'b0;
  reg         clk500_sig = 1'b0;
  reg  [9:0]  sw_sig     = 10'b0;
  reg  [1:0]  key_sig    = 2'h3;
  wire [9:0]  ledr_sig;
  wire [7:0]  hex0_sig, hex1_sig, hex2_sig, hex3_sig, hex4_sig, hex5_sig;

  de10_top uut (.MAX10_CLK1_50(clk_sig), .CLOCK_500Hz(clk500_sig), .SW(sw_sig), .KEY(key_sig), .LEDR(ledr_sig), .HEX0(hex0_sig), .HEX1(hex1_sig), .HEX2(hex2_sig), .HEX3(hex3_sig), .HEX4(hex4_sig), .HEX5(hex5_sig));

  always #10 clk_sig = ~clk_sig;
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
  // 58-bit board state whenever it (or the applied sequence number) changes.
  wire [57:0] board_bits = {ledr_sig, hex0_sig, hex1_sig, hex2_sig, hex3_sig, hex4_sig, hex5_sig};
  integer fin, fout, scan_count, seq, applied_seq = 0, last_seq = -1;
  integer hold_ns, dwell_ns, wait_ns;
  reg [11:0] rec;
  reg [8*80-1:0] in_line;
  reg [57:0] last_bits = 58'bx;
  time applied_at = 0;
  reg applied_one;
  initial begin
    #1;
    dwell_ns = min_dwell_ns;
    wait_ns = poll_interval_ns;
    forever begin
      #(wait_ns * 1);
      wait_ns = poll_interval_ns;
      if (input_file != 0 && ($time - applied_at) >= dwell_ns) begin
        fin = $fopen(input_file, "r");
        if (fin != 0) begin
          applied_one = 0;
          while (!applied_one && $fgets(in_line, fin) != 0) begin
            hold_ns = 0;
            scan_count = $sscanf(in_line, "%d %b %d", seq, rec, hold_ns);
            if (scan_count >= 2 && seq > applied_seq) begin
              sw_sig = rec[11:2];
              key_sig = rec[1:0];
              applied_seq = seq;
              applied_at = $time;
              applied_one = 1;
              if (hold_ns > 0) begin
                dwell_ns = hold_ns;
                wait_ns = hold_ns;
              end else begin
                dwell_ns = min_dwell_ns;
              end
            end
          end
          $fclose(fin);
        end
      end
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
