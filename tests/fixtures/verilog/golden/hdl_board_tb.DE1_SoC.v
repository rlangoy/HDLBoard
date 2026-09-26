`timescale 1ns/1ps

module hdl_board_tb;
  reg         clk_sig    = 1'b0;
  reg         clk500_sig = 1'b0;
  reg  [9:0]  sw_sig     = 10'b0;
  reg  [3:0]  key_sig    = 4'hF;
  wire [9:0]  ledr_sig;
  wire [6:0]  hex0_sig, hex1_sig, hex2_sig, hex3_sig, hex4_sig, hex5_sig;
  

  DE1_SoC uut (.CLOCK_50(clk_sig), .SW(sw_sig), .KEY_N(key_sig), .LEDR(ledr_sig), .HEX0_N(hex0_sig), .HEX1_N(hex1_sig), .HEX2_N(hex2_sig), .HEX3_N(hex3_sig), .HEX4_N(hex4_sig), .HEX5_N(hex5_sig));

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
  // 52-bit board state whenever it (or the applied sequence number) changes.
  wire [51:0] board_bits = {ledr_sig, hex0_sig, hex1_sig, hex2_sig, hex3_sig, hex4_sig, hex5_sig};
  integer fin, fout, scan_count, seq, applied_seq = 0, last_seq = -1;
  reg [13:0] rec;
  reg [51:0] last_bits = 52'bx;
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
              sw_sig = rec[13:4];
              key_sig = rec[3:0];
              applied_seq = seq;
              applied_at = $time;
              applied_one = 1;
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
